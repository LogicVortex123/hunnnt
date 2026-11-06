import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import pino from "pino";

const app = express();
const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") ?? false }));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ service: "opportunityos-api", status: "ok", timestamp: new Date().toISOString() });
});

app.get("/api/v1", (_req, res) => {
  res.json({ name: "OpportunityOS API", version: "0.1.0", status: "scaffold" });
});

const port = Number(process.env.API_PORT ?? 4000);
app.listen(port, () => logger.info({ port }, "OpportunityOS API listening"));
