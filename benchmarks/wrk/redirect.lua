-- Exercises the RedirectIQ slug redirect endpoint for wrk benchmarks.
local slug = os.getenv("REDIRECTIQ_BENCH_SLUG") or "benchmark"

request = function()
  return wrk.format("GET", "/" .. slug, {
    ["Accept"] = "*/*",
    ["Cache-Control"] = "no-cache"
  })
end
