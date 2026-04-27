# Parses RedirectIQ benchmark outputs and generates comparison charts plus a winner summary.
import json
import math
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path

try:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
except ModuleNotFoundError as error:
    missing_package = getattr(error, "name", "") or "matplotlib"
    raise SystemExit(
        f"Missing Python dependency: {missing_package}. "
        "Install the benchmark analyzer dependencies with "
        "`python3 -m pip install -r benchmark/requirements.txt`, "
        "then rerun `python3 benchmark/analyze.py` after "
        "`bash benchmark/run_bench.sh` finishes."
    ) from error

ROOT_DIR = Path(__file__).resolve().parent.parent
RESULTS_DIR = ROOT_DIR / "results"
GRAPHS_DIR = RESULTS_DIR / "graphs"
FRONTEND_PUBLIC_DIR = ROOT_DIR / "frontend" / "public"
FRONTEND_DIST_DIR = ROOT_DIR / "frontend" / "dist"
FRONTEND_GRAPHS_DIRNAME = "benchmark-graphs"
FRAMEWORKS = ["node", "flask", "nginx", "apache"]
CONCURRENCY_LEVELS = [1, 10, 50, 100, 250, 500]
CACHE_IMPACT_CONCURRENCY = 100
COLORS = {
    "node": "#2563eb",
    "flask": "#db6a4d",
    "nginx": "#0f766e",
    "apache": "#7c3aed",
}
CACHE_MODE_COLORS = {
    "cold": "#c8c1b7",
    "warm": "#181614",
}
GRAPH_SPECS = [
    ("throughput_comparison.png", "Throughput by Framework and Concurrency Level"),
    ("latency_p50_p99.png", "Latency Distribution (p50 vs p99)"),
    ("latency_scaling_curve.png", "How Tail Latency Scales with Concurrency"),
    ("throughput_scaling_curve.png", "Throughput Scaling Curve"),
    ("error_rate.png", "Error Rate at 500 Concurrent Connections"),
    ("cache_impact_throughput.png", "Cold vs Warm Cache Throughput"),
    ("cache_impact_latency.png", "Cold vs Warm Cache Tail Latency"),
    ("summary_table.png", "RedirectIQ Framework Benchmark Summary"),
]


def parse_number(value):
    text = str(value).strip()
    match = re.fullmatch(r"([0-9]*\.?[0-9]+)([kKmMgG]?)", text)

    if not match:
        raise ValueError(f"Unsupported numeric value: {value}")

    number = float(match.group(1))
    suffix = match.group(2).lower()
    multiplier = {"": 1, "k": 1_000, "m": 1_000_000, "g": 1_000_000_000}[suffix]
    return number * multiplier


def parse_latency_to_ms(value):
    text = str(value).strip()
    match = re.fullmatch(r"([0-9]*\.?[0-9]+)\s*(ns|us|µs|ms|s)", text, re.IGNORECASE)

    if not match:
        raise ValueError(f"Unsupported latency value: {value}")

    number = float(match.group(1))
    unit = match.group(2).lower()

    if unit == "ns":
        return number / 1_000_000
    if unit in {"us", "µs"}:
        return number / 1_000
    if unit == "ms":
        return number
    if unit == "s":
        return number * 1_000

    raise ValueError(f"Unsupported latency unit: {unit}")


def parse_wrk_metrics(path):
    metrics = {
        "requests_sec": math.nan,
        "p50_ms": math.nan,
        "p99_ms": math.nan,
        "non_success": 0,
        "total_requests": math.nan,
        "error_rate": math.nan,
    }

    if not path.exists():
        return metrics

    text = path.read_text(errors="ignore")

    requests_match = re.search(r"Requests/sec:\s+([0-9.]+[kKmMgG]?)", text)

    if requests_match:
        metrics["requests_sec"] = parse_number(requests_match.group(1))

    total_requests_match = re.search(r"(\d+)\s+requests in", text)

    if total_requests_match:
        metrics["total_requests"] = float(total_requests_match.group(1))

    non_success_match = re.search(r"Non-2xx or 3xx responses:\s+(\d+)", text)

    if non_success_match:
        metrics["non_success"] = int(non_success_match.group(1))

    for line in text.splitlines():
        stripped = line.strip()

        percentile_match = re.match(r"^(50(?:\.0+)?|99(?:\.0+)?)%\s+([0-9.]+\s*(?:ns|us|µs|ms|s))$", stripped)

        if percentile_match:
            percentile = percentile_match.group(1)
            latency_ms = parse_latency_to_ms(percentile_match.group(2))

            if percentile.startswith("50"):
                metrics["p50_ms"] = latency_ms
            if percentile.startswith("99"):
                metrics["p99_ms"] = latency_ms

        latency_match = re.match(
            r"^Latency\s+(50|99)%\s+([0-9.]+\s*(?:ns|us|µs|ms|s))$",
            stripped,
            re.IGNORECASE,
        )

        if latency_match:
            latency_ms = parse_latency_to_ms(latency_match.group(2))

            if latency_match.group(1) == "50":
                metrics["p50_ms"] = latency_ms
            if latency_match.group(1) == "99":
                metrics["p99_ms"] = latency_ms

    if not math.isnan(metrics["total_requests"]) and metrics["total_requests"] > 0:
        metrics["error_rate"] = metrics["non_success"] / metrics["total_requests"] * 100
    else:
        metrics["error_rate"] = 0.0

    return metrics


def sanitize_number(value):
    if value is None:
        return None

    if isinstance(value, float) and math.isnan(value):
        return None

    return float(value)


def has_any_benchmark_data(data):
    for framework in FRAMEWORKS:
        for concurrency in CONCURRENCY_LEVELS:
            metrics = data[framework][concurrency]

            if not math.isnan(metrics["requests_sec"]):
                return True

    return False


def get_missing_wrk_measurements(data):
    missing = []

    for framework in FRAMEWORKS:
        for concurrency in CONCURRENCY_LEVELS:
            metrics = data[framework][concurrency]

            if math.isnan(metrics["requests_sec"]) or math.isnan(metrics["p50_ms"]) or math.isnan(metrics["p99_ms"]):
                missing.append(f"{framework}:c{concurrency}")

    return missing


def load_results():
    data = {}

    for framework in FRAMEWORKS:
        data[framework] = {}

        for concurrency in CONCURRENCY_LEVELS:
            wrk_path = RESULTS_DIR / framework / f"wrk_c{concurrency}.txt"
            data[framework][concurrency] = parse_wrk_metrics(wrk_path)

    return data


def load_cache_impact_results():
    data = {}

    for framework in FRAMEWORKS:
        data[framework] = {
            "cold": parse_wrk_metrics(RESULTS_DIR / framework / "cold_wrk.txt"),
            "warm": parse_wrk_metrics(RESULTS_DIR / framework / "warm_wrk.txt"),
        }

    return data


def save_throughput_comparison(data):
    figure, axis = plt.subplots(figsize=(12, 7))
    x_positions = list(range(len(CONCURRENCY_LEVELS)))
    bar_width = 0.18

    for index, framework in enumerate(FRAMEWORKS):
        offsets = [position + (index - 1.5) * bar_width for position in x_positions]
        values = [data[framework][concurrency]["requests_sec"] for concurrency in CONCURRENCY_LEVELS]
        axis.bar(offsets, values, width=bar_width, label=framework, color=COLORS[framework])

    axis.set_xticks(x_positions)
    axis.set_xticklabels([str(level) for level in CONCURRENCY_LEVELS])
    axis.set_xlabel("Concurrency Level")
    axis.set_ylabel("Requests / Second")
    axis.set_title("Throughput by Framework and Concurrency Level")
    axis.legend()
    axis.grid(axis="y", alpha=0.25)
    figure.tight_layout()
    figure.savefig(GRAPHS_DIR / "throughput_comparison.png", dpi=200)
    plt.close(figure)


def save_latency_distribution(data):
    figure, axes = plt.subplots(1, 2, figsize=(15, 6), sharex=True)
    x_positions = list(range(len(CONCURRENCY_LEVELS)))
    bar_width = 0.18

    for index, framework in enumerate(FRAMEWORKS):
        offsets = [position + (index - 1.5) * bar_width for position in x_positions]
        p50_values = [data[framework][concurrency]["p50_ms"] for concurrency in CONCURRENCY_LEVELS]
        p99_values = [data[framework][concurrency]["p99_ms"] for concurrency in CONCURRENCY_LEVELS]
        axes[0].bar(offsets, p50_values, width=bar_width, label=framework, color=COLORS[framework])
        axes[1].bar(offsets, p99_values, width=bar_width, label=framework, color=COLORS[framework])

    axes[0].set_title("p50")
    axes[1].set_title("p99")

    for axis in axes:
        axis.set_xticks(x_positions)
        axis.set_xticklabels([str(level) for level in CONCURRENCY_LEVELS])
        axis.set_xlabel("Concurrency Level")
        axis.set_ylabel("Latency (ms)")
        axis.grid(axis="y", alpha=0.25)

    axes[1].legend()
    figure.suptitle("Latency Distribution (p50 vs p99)")
    figure.tight_layout()
    figure.savefig(GRAPHS_DIR / "latency_p50_p99.png", dpi=200)
    plt.close(figure)


def save_latency_scaling_curve(data):
    figure, axis = plt.subplots(figsize=(12, 7))

    for framework in FRAMEWORKS:
        values = [data[framework][concurrency]["p99_ms"] for concurrency in CONCURRENCY_LEVELS]
        axis.plot(CONCURRENCY_LEVELS, values, marker="o", linewidth=2, label=framework, color=COLORS[framework])

    axis.set_xlabel("Concurrency Level")
    axis.set_ylabel("p99 Latency (ms)")
    axis.set_title("How Tail Latency Scales with Concurrency")
    axis.legend()
    axis.grid(alpha=0.25)
    figure.tight_layout()
    figure.savefig(GRAPHS_DIR / "latency_scaling_curve.png", dpi=200)
    plt.close(figure)


def save_throughput_scaling_curve(data):
    figure, axis = plt.subplots(figsize=(12, 7))

    for framework in FRAMEWORKS:
        values = [data[framework][concurrency]["requests_sec"] for concurrency in CONCURRENCY_LEVELS]
        axis.plot(CONCURRENCY_LEVELS, values, marker="o", linewidth=2, label=framework, color=COLORS[framework])

    axis.set_xlabel("Concurrency Level")
    axis.set_ylabel("Requests / Second")
    axis.set_title("Throughput Scaling Curve")
    axis.legend()
    axis.grid(alpha=0.25)
    figure.tight_layout()
    figure.savefig(GRAPHS_DIR / "throughput_scaling_curve.png", dpi=200)
    plt.close(figure)


def save_error_rate(data):
    figure, axis = plt.subplots(figsize=(10, 6))
    highest_concurrency = CONCURRENCY_LEVELS[-1]
    values = [data[framework][highest_concurrency]["error_rate"] for framework in FRAMEWORKS]
    axis.bar(FRAMEWORKS, values, color=[COLORS[framework] for framework in FRAMEWORKS])
    axis.set_ylabel("Error Rate (%)")
    axis.set_title("Error Rate at 500 Concurrent Connections")
    axis.grid(axis="y", alpha=0.25)
    figure.tight_layout()
    figure.savefig(GRAPHS_DIR / "error_rate.png", dpi=200)
    plt.close(figure)


def save_cache_impact_chart(cache_impact_data, metric_key, filename, title, ylabel, suffix):
    figure, axis = plt.subplots(figsize=(12, 7))
    x_positions = list(range(len(FRAMEWORKS)))
    bar_width = 0.34
    cold_heights = []
    warm_heights = []
    cold_labels = []
    warm_labels = []

    for framework in FRAMEWORKS:
        cold_value = cache_impact_data[framework]["cold"][metric_key]
        warm_value = cache_impact_data[framework]["warm"][metric_key]

        cold_heights.append(0.0 if math.isnan(cold_value) else cold_value)
        warm_heights.append(0.0 if math.isnan(warm_value) else warm_value)
        cold_labels.append("n/a" if math.isnan(cold_value) else f"{cold_value:.2f}{suffix}")
        warm_labels.append("n/a" if math.isnan(warm_value) else f"{warm_value:.2f}{suffix}")

    cold_offsets = [position - bar_width / 2 for position in x_positions]
    warm_offsets = [position + bar_width / 2 for position in x_positions]
    cold_bars = axis.bar(cold_offsets, cold_heights, width=bar_width, label="Cold", color=CACHE_MODE_COLORS["cold"])
    warm_bars = axis.bar(warm_offsets, warm_heights, width=bar_width, label="Warm", color=CACHE_MODE_COLORS["warm"])

    axis.set_xticks(x_positions)
    axis.set_xticklabels([framework.capitalize() for framework in FRAMEWORKS])
    axis.set_ylabel(ylabel)
    axis.set_title(title)
    axis.legend()
    axis.grid(axis="y", alpha=0.25)
    axis.bar_label(cold_bars, labels=cold_labels, padding=3, fontsize=9)
    axis.bar_label(warm_bars, labels=warm_labels, padding=3, fontsize=9)
    figure.tight_layout()
    figure.savefig(GRAPHS_DIR / filename, dpi=200)
    plt.close(figure)


def save_cache_impact_throughput(cache_impact_data):
    save_cache_impact_chart(
        cache_impact_data,
        "requests_sec",
        "cache_impact_throughput.png",
        f"Cold vs Warm Cache Throughput (c{CACHE_IMPACT_CONCURRENCY})",
        "Requests / Second",
        " req/s",
    )


def save_cache_impact_latency(cache_impact_data):
    save_cache_impact_chart(
        cache_impact_data,
        "p99_ms",
        "cache_impact_latency.png",
        f"Cold vs Warm Cache p99 Latency (c{CACHE_IMPACT_CONCURRENCY})",
        "p99 Latency (ms)",
        " ms",
    )


def format_metric(value, suffix=""):
    if value is None or math.isnan(value):
        return "n/a"
    return f"{value:.2f}{suffix}"


def save_summary_table(data):
    figure, axis = plt.subplots(figsize=(14, 4))
    axis.axis("off")

    rows = []
    summary_values = {
        "Best Throughput (req/s)": {},
        "p50 @ c100": {},
        "p99 @ c100": {},
        "p99 @ c500": {},
        "Error Rate": {},
    }

    for framework in FRAMEWORKS:
        best_throughput = max(data[framework][concurrency]["requests_sec"] for concurrency in CONCURRENCY_LEVELS)
        p50_c100 = data[framework][100]["p50_ms"]
        p99_c100 = data[framework][100]["p99_ms"]
        p99_c500 = data[framework][500]["p99_ms"]
        error_rate = data[framework][500]["error_rate"]

        summary_values["Best Throughput (req/s)"][framework] = best_throughput
        summary_values["p50 @ c100"][framework] = p50_c100
        summary_values["p99 @ c100"][framework] = p99_c100
        summary_values["p99 @ c500"][framework] = p99_c500
        summary_values["Error Rate"][framework] = error_rate

        rows.append(
            [
                framework,
                format_metric(best_throughput),
                format_metric(p50_c100, " ms"),
                format_metric(p99_c100, " ms"),
                format_metric(p99_c500, " ms"),
                format_metric(error_rate, " %"),
            ]
        )

    column_labels = [
        "Framework",
        "Best Throughput (req/s)",
        "p50 @ c100",
        "p99 @ c100",
        "p99 @ c500",
        "Error Rate",
    ]

    table = axis.table(cellText=rows, colLabels=column_labels, cellLoc="center", loc="center")
    table.auto_set_font_size(False)
    table.set_fontsize(10)
    table.scale(1, 1.8)

    higher_is_better = {"Best Throughput (req/s)"}

    for column_index, column_name in enumerate(column_labels[1:], start=1):
        column_values = summary_values[column_name]
        valid_items = [(framework, value) for framework, value in column_values.items() if not math.isnan(value)]

        if not valid_items:
            continue

        if column_name in higher_is_better:
            best_value = max(value for _, value in valid_items)
        else:
            best_value = min(value for _, value in valid_items)

        for row_index, framework in enumerate(FRAMEWORKS, start=1):
            value = column_values[framework]

            if not math.isnan(value) and value == best_value:
                table[row_index, column_index].set_facecolor("#d1fae5")

    axis.set_title("RedirectIQ Framework Benchmark Summary", pad=16)
    figure.tight_layout()
    figure.savefig(GRAPHS_DIR / "summary_table.png", dpi=200, bbox_inches="tight")
    plt.close(figure)


def choose_winners(data):
    throughput_candidates = {
        framework: data[framework][500]["requests_sec"]
        for framework in FRAMEWORKS
        if not math.isnan(data[framework][500]["requests_sec"])
    }
    latency_candidates = {
        framework: data[framework][100]["p99_ms"]
        for framework in FRAMEWORKS
        if not math.isnan(data[framework][100]["p99_ms"])
    }

    if not throughput_candidates or not latency_candidates:
        raise SystemExit("No benchmark data found. Run bash benchmark/run_bench.sh first.")

    throughput_winner = max(throughput_candidates.items(), key=lambda item: item[1])
    latency_winner = min(latency_candidates.items(), key=lambda item: item[1])

    max_throughput = max(throughput_candidates.values())
    min_latency = min(latency_candidates.values())
    overall_scores = {}

    for framework in FRAMEWORKS:
        if framework not in throughput_candidates or framework not in latency_candidates:
            continue

        throughput_score = throughput_candidates[framework] / max_throughput if max_throughput else 0.0
        latency_score = min_latency / latency_candidates[framework] if latency_candidates[framework] else 0.0
        overall_scores[framework] = throughput_score + latency_score

    if not overall_scores:
        raise SystemExit("Not enough benchmark data to compute an overall winner.")

    overall_winner = max(overall_scores.items(), key=lambda item: item[1])
    return throughput_winner, latency_winner, overall_winner


def build_summary_payload(data, cache_impact_data, throughput_winner, latency_winner, overall_winner):
    summary_rows = []
    series = {}

    for framework in FRAMEWORKS:
        framework_series = []

        for concurrency in CONCURRENCY_LEVELS:
            metrics = data[framework][concurrency]
            framework_series.append(
                {
                    "concurrency": concurrency,
                    "requestsSec": sanitize_number(metrics["requests_sec"]),
                    "p50Ms": sanitize_number(metrics["p50_ms"]),
                    "p99Ms": sanitize_number(metrics["p99_ms"]),
                    "errorRate": sanitize_number(metrics["error_rate"]),
                    "nonSuccess": metrics["non_success"],
                    "totalRequests": sanitize_number(metrics["total_requests"]),
                }
            )

        series[framework] = framework_series
        summary_rows.append(
            {
                "framework": framework,
                "bestThroughput": max(
                    sanitize_number(data[framework][concurrency]["requests_sec"]) or 0.0
                    for concurrency in CONCURRENCY_LEVELS
                ),
                "p50At100": sanitize_number(data[framework][100]["p50_ms"]),
                "p99At100": sanitize_number(data[framework][100]["p99_ms"]),
                "p99At500": sanitize_number(data[framework][500]["p99_ms"]),
                "errorRate": sanitize_number(data[framework][500]["error_rate"]),
            }
        )

    return {
        "hasData": True,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "frameworks": FRAMEWORKS,
        "concurrencyLevels": CONCURRENCY_LEVELS,
        "winners": {
            "throughput": {
                "framework": throughput_winner[0],
                "value": round(throughput_winner[1], 2),
                "concurrency": 500,
            },
            "latency": {
                "framework": latency_winner[0],
                "value": round(latency_winner[1], 2),
                "concurrency": 100,
            },
            "overall": {
                "framework": overall_winner[0],
            },
        },
        "summaryTable": summary_rows,
        "series": series,
        "cache_impact": {
            "concurrency": CACHE_IMPACT_CONCURRENCY,
            "frameworks": {
                framework: {
                    "cold": {
                        "requestsSec": sanitize_number(cache_impact_data[framework]["cold"]["requests_sec"]),
                        "p50Ms": sanitize_number(cache_impact_data[framework]["cold"]["p50_ms"]),
                        "p99Ms": sanitize_number(cache_impact_data[framework]["cold"]["p99_ms"]),
                        "errorRate": sanitize_number(cache_impact_data[framework]["cold"]["error_rate"]),
                    },
                    "warm": {
                        "requestsSec": sanitize_number(cache_impact_data[framework]["warm"]["requests_sec"]),
                        "p50Ms": sanitize_number(cache_impact_data[framework]["warm"]["p50_ms"]),
                        "p99Ms": sanitize_number(cache_impact_data[framework]["warm"]["p99_ms"]),
                        "errorRate": sanitize_number(cache_impact_data[framework]["warm"]["error_rate"]),
                    },
                }
                for framework in FRAMEWORKS
            },
        },
        "graphs": [
            {
                "file": filename,
                "title": title,
                "url": f"/{FRONTEND_GRAPHS_DIRNAME}/{filename}",
            }
            for filename, title in GRAPH_SPECS
        ],
    }


def build_empty_payload():
    return {
        "hasData": False,
        "generatedAt": None,
        "frameworks": FRAMEWORKS,
        "concurrencyLevels": CONCURRENCY_LEVELS,
        "winners": None,
        "summaryTable": [],
        "series": {},
        "cache_impact": {
            "concurrency": CACHE_IMPACT_CONCURRENCY,
            "frameworks": {
                framework: {
                    "cold": {
                        "requestsSec": None,
                        "p50Ms": None,
                        "p99Ms": None,
                        "errorRate": None,
                    },
                    "warm": {
                        "requestsSec": None,
                        "p50Ms": None,
                        "p99Ms": None,
                        "errorRate": None,
                    },
                }
                for framework in FRAMEWORKS
            },
        },
        "graphs": [
            {
                "file": filename,
                "title": title,
                "url": f"/{FRONTEND_GRAPHS_DIRNAME}/{filename}",
            }
            for filename, title in GRAPH_SPECS
        ],
    }


def write_summary_artifacts(payload):
    target_paths = [
        GRAPHS_DIR / "benchmark-summary.json",
        FRONTEND_PUBLIC_DIR / "benchmark-summary.json",
    ]

    if FRONTEND_DIST_DIR.exists():
        target_paths.append(FRONTEND_DIST_DIR / "benchmark-summary.json")

    for target_path in target_paths:
        target_path.parent.mkdir(parents=True, exist_ok=True)
        target_path.write_text(f"{json.dumps(payload, indent=2)}\n")


def publish_graph_artifacts():
    destinations = [FRONTEND_PUBLIC_DIR / FRONTEND_GRAPHS_DIRNAME]

    if FRONTEND_DIST_DIR.exists():
        destinations.append(FRONTEND_DIST_DIR / FRONTEND_GRAPHS_DIRNAME)

    for destination in destinations:
        destination.mkdir(parents=True, exist_ok=True)

        for filename, _ in GRAPH_SPECS:
            source_path = GRAPHS_DIR / filename

            if source_path.exists():
                shutil.copy2(source_path, destination / filename)


def main():
    GRAPHS_DIR.mkdir(parents=True, exist_ok=True)
    data = load_results()
    cache_impact_data = load_cache_impact_results()

    if not has_any_benchmark_data(data):
        write_summary_artifacts(build_empty_payload())
        raise SystemExit("No benchmark data found. Run bash benchmark/run_bench.sh first.")

    missing_measurements = get_missing_wrk_measurements(data)

    if missing_measurements:
        write_summary_artifacts(build_empty_payload())
        missing_preview = ", ".join(missing_measurements[:8])
        if len(missing_measurements) > 8:
            missing_preview += ", ..."
        raise SystemExit(
            f"Incomplete benchmark data found. Missing wrk metrics for: {missing_preview}. "
            "Rerun bash benchmark/run_bench.sh and wait for it to finish before running analyze.py."
        )

    save_throughput_comparison(data)
    save_latency_distribution(data)
    save_latency_scaling_curve(data)
    save_throughput_scaling_curve(data)
    save_error_rate(data)
    save_cache_impact_throughput(cache_impact_data)
    save_cache_impact_latency(cache_impact_data)
    save_summary_table(data)

    throughput_winner, latency_winner, overall_winner = choose_winners(data)
    payload = build_summary_payload(data, cache_impact_data, throughput_winner, latency_winner, overall_winner)
    write_summary_artifacts(payload)
    publish_graph_artifacts()
    print(f"THROUGHPUT WINNER: {throughput_winner[0]} ({throughput_winner[1]:.2f} req/s at c500)")
    print(f"LATENCY WINNER: {latency_winner[0]} ({latency_winner[1]:.2f}ms p99 at c100)")
    print(f"OVERALL WINNER: {overall_winner[0]}")


if __name__ == "__main__":
    main()
