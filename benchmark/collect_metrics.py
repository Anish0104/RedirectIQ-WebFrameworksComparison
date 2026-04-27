#!/usr/bin/env python3
"""Collect lightweight process metrics for RedirectIQ benchmark runs."""

from __future__ import annotations

import argparse
import csv
import signal
import sys
import time
from pathlib import Path

try:
    import psutil
except ModuleNotFoundError as error:
    missing_package = getattr(error, "name", "") or "psutil"
    raise SystemExit(
        f"Missing Python dependency: {missing_package}. "
        "Install it with `python3 -m pip install -r benchmark/requirements.txt`, "
        "then rerun `bash benchmark/run_bench.sh`."
    ) from error


FRAMEWORK_PORTS = {
    "node": 3001,
    "flask": 3002,
    "nginx": 3003,
    "apache": 3004,
}
SHOULD_STOP = False


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Collect process-level benchmark metrics.")
    parser.add_argument("--pid", type=int, help="Root process ID to monitor.")
    parser.add_argument("--output", required=True, help="CSV file path for metric samples.")
    parser.add_argument("--interval", type=float, default=0.5, help="Sampling interval in seconds.")
    return parser.parse_args()


def handle_signal(_signum: int, _frame) -> None:
    global SHOULD_STOP
    SHOULD_STOP = True


def infer_port_from_output(output_path: Path) -> int | None:
    stem = output_path.stem

    for framework, port in FRAMEWORK_PORTS.items():
        if stem.endswith(f"_{framework}"):
            return port

    return None


def find_pid_by_port(port: int) -> int | None:
    for connection in psutil.net_connections(kind="tcp"):
        local_address = getattr(connection, "laddr", None)

        if (
            connection.status == psutil.CONN_LISTEN
            and local_address
            and getattr(local_address, "port", None) == port
            and connection.pid
        ):
            return int(connection.pid)

    return None


def get_process_tree(root_pid: int) -> list[psutil.Process]:
    try:
        root_process = psutil.Process(root_pid)
    except psutil.NoSuchProcess:
        return []

    processes = [root_process]

    try:
        processes.extend(root_process.children(recursive=True))
    except (psutil.Error, OSError):
        pass

    unique_processes: list[psutil.Process] = []
    seen_pids: set[int] = set()

    for process in processes:
        try:
            pid = process.pid
            process.is_running()
        except (psutil.Error, OSError):
            continue

        if pid not in seen_pids:
            seen_pids.add(pid)
            unique_processes.append(process)

    return unique_processes


def prime_cpu_counters(processes: list[psutil.Process]) -> None:
    for process in processes:
        try:
            process.cpu_percent(interval=None)
        except (psutil.Error, OSError):
            continue


def collect_sample(root_pid: int) -> dict[str, float | int] | None:
    processes = get_process_tree(root_pid)

    if not processes:
        return None

    total_cpu = 0.0
    total_rss_bytes = 0
    total_open_fds = 0

    for process in processes:
        try:
            total_cpu += process.cpu_percent(interval=None)
            total_rss_bytes += process.memory_info().rss
            total_open_fds += process.num_fds()
        except (psutil.AccessDenied, psutil.NoSuchProcess, psutil.ZombieProcess, OSError, AttributeError):
            continue

    return {
        "timestamp": time.time(),
        "cpu_percent": total_cpu,
        "rss_memory_mb": total_rss_bytes / (1024 * 1024),
        "open_fds": total_open_fds,
    }


def main() -> int:
    args = parse_args()
    output_path = Path(args.output).expanduser().resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    root_pid = args.pid

    if root_pid is None:
        inferred_port = infer_port_from_output(output_path)

        if inferred_port is None:
            raise SystemExit(
                "Unable to infer a framework port from the output filename. "
                "Pass --pid or use an output path like metrics_node.csv."
            )

        root_pid = find_pid_by_port(inferred_port)

        if root_pid is None:
            raise SystemExit(f"Could not find a listening process on port {inferred_port}.")

    process_tree = get_process_tree(root_pid)

    if not process_tree:
        raise SystemExit(f"Could not find a running process tree for pid {root_pid}.")

    prime_cpu_counters(process_tree)

    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)

    with output_path.open("w", newline="") as output_file:
        writer = csv.DictWriter(
            output_file,
            fieldnames=["timestamp", "cpu_percent", "rss_memory_mb", "open_fds"],
        )
        writer.writeheader()
        output_file.flush()

        while not SHOULD_STOP:
            time.sleep(max(args.interval, 0.1))
            sample = collect_sample(root_pid)

            if sample is None:
                break

            writer.writerow(sample)
            output_file.flush()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
