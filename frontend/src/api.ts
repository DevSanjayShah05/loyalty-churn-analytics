import type {
  CampaignRequest,
  CampaignResult,
  ChurnDrivers,
  Customer360,
  CustomersResponse,
  Overview,
  Segment,
  UpliftResponse,
} from "./types";

const BASE = "/api";

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    throw new Error(`GET ${path} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function fetchOverview(): Promise<Overview> {
  return getJSON<Overview>("/overview");
}

export function fetchSegments(): Promise<{ segments: Segment[] }> {
  return getJSON<{ segments: Segment[] }>("/segments");
}

export interface CustomersQuery {
  segment?: string;
  risk?: string;
  search?: string;
  sort_by?: string;
  descending?: boolean;
  limit?: number;
  offset?: number;
}

export function fetchCustomers(q: CustomersQuery = {}): Promise<CustomersResponse> {
  const params = new URLSearchParams();
  if (q.segment) params.set("segment", q.segment);
  if (q.risk) params.set("risk", q.risk);
  if (q.search) params.set("search", q.search);
  if (q.sort_by) params.set("sort_by", q.sort_by);
  if (q.descending !== undefined) params.set("descending", String(q.descending));
  if (q.limit !== undefined) params.set("limit", String(q.limit));
  if (q.offset !== undefined) params.set("offset", String(q.offset));
  const qs = params.toString();
  return getJSON<CustomersResponse>(`/customers${qs ? `?${qs}` : ""}`);
}

export function fetchCustomer360(personId: string): Promise<Customer360> {
  return getJSON<Customer360>(`/customers/${personId}`);
}

export function fetchChurnDrivers(): Promise<ChurnDrivers> {
  return getJSON<ChurnDrivers>("/churn/drivers");
}

export function fetchUplift(): Promise<UpliftResponse> {
  return getJSON<UpliftResponse>("/uplift");
}

export async function simulateCampaign(req: CampaignRequest): Promise<CampaignResult> {
  const res = await fetch(`${BASE}/campaign/simulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    throw new Error(`campaign simulate failed: ${res.status}`);
  }
  return res.json() as Promise<CampaignResult>;
}
