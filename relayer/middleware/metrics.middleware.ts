import { Histogram, register } from "prom-client";
import { Middleware } from "../compose.middleware";
import { StorageContext } from "../storage/storage";
import { Counter, Registry } from "prom-client";

type MetricRecord = Record<string, string | number>;

export interface MetricsOpts<C extends StorageContext> {
  registry?: Registry;
  labels?: MetricLabelsOpts<C>;
  processingTimeBuckets?: number[];
}

export class MetricLabelsOpts<C extends StorageContext> {
  labelNames: string[];
  customizer: (context: C) => Promise<MetricRecord>;

  constructor(
    labelNames: string[] = [],
    customizer: (ctx: C) => Promise<MetricRecord>,
  ) {
    this.labelNames = labelNames;
    this.customizer = customizer;
  }
}

const getLabels = async <C extends StorageContext>(
  ctx: C,
  opts: MetricsOpts<C>,
  failed: boolean,
) => {
  const defaultLabels = { status: failed ? "failed" : "succeeded" };

  try {
    const labels: MetricRecord = await (opts.labels?.customizer(ctx) ??
      Promise.resolve({}));

    const allowedKeys = opts.labels?.labelNames ?? [];
    const validatedLabels: typeof labels = {};
    allowedKeys.forEach(key => {
      if (labels[key]) {
        validatedLabels[key] = labels[key];
      }
    });

    return { ...validatedLabels, ...defaultLabels };
  } catch (error) {
    ctx.logger?.error(
      "Failed to customize metric labels, please review",
      error,
    );

    return defaultLabels;
  }
};

export function metrics<C extends StorageContext>(
  opts: MetricsOpts<C> = {},
): Middleware<C> {
  opts.registry = opts.registry || register;

  const processedVaasTotal = new Counter({
    name: "vaas_processed_total",
    help: "Number of incoming vaas processed successfully or unsuccessfully.",
    labelNames: ["status"].concat(opts.labels?.labelNames ?? []),
    registers: [opts.registry],
  });

  const finishedVaasTotal = new Counter({
    name: "vaas_finished_total",
    help: "Number of vaas processed successfully or unsuccessfully.",
    labelNames: ["status", "terminal"].concat(opts.labels?.labelNames ?? []),
    registers: [opts.registry],
  });

  const processingDuration = new Histogram({
    name: "vaas_processing_duration",
    help: "Processing time in ms for jobs",
    buckets: opts.processingTimeBuckets ?? [
      6000, 7000, 7500, 8000, 8500, 9000, 10000, 12000,
    ],
    labelNames: ["status"].concat(opts.labels?.labelNames ?? []),
    registers: [opts.registry],
  });

  return async (ctx: C, next) => {
    processedVaasTotal.inc();

    const startTime = Date.now();
    let failure: Error = null;

    try {
      await next();
    } catch (e) {
      failure = e;
    }

    const time = Date.now() - startTime;
    const labels = await getLabels(ctx, opts, failure !== null);
    processingDuration.labels(labels).observe(time);

    if (failure) {
      const reachedMaxAttempts =
        (ctx.storage.job?.attempts ?? 0) ===
        (ctx.storage.job?.maxAttempts ?? -1);
      finishedVaasTotal
        .labels({ ...labels, terminal: `${reachedMaxAttempts}` })
        .inc();

      throw failure;
    }

    finishedVaasTotal.labels(labels).inc();
  };
}
