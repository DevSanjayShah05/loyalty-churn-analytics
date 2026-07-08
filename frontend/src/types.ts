export interface Overview {
  n_customers: number;
  n_active: number;
  total_revenue: number;
  avg_clv_12m: number;
  total_clv_12m: number;
  churn_rate: number;
  high_risk_customers: number;
  avg_order_value: number;
  model_roc_auc: number;
  n_offers: number;
}

export interface Segment {
  segment: string;
  count: number;
  pct_of_base: number;
  avg_recency_days: number;
  avg_frequency: number;
  avg_monetary: number;
  avg_rfm_score: number;
  avg_clv_12m: number;
  churn_rate: number;
  avg_churn_prob: number;
  revenue_share: number;
}

export type RiskBand = "Low" | "Medium" | "High";

export interface Driver {
  feature: string;
  contribution: number;
  direction: string;
}

export interface CustomerRow {
  person_id: string;
  segment: string;
  rfm_cell: string;
  rfm_score: number;
  recency_days: number;
  frequency: number;
  monetary: number;
  clv_12m: number;
  churn_prob: number;
  churn_risk_band: RiskBand;
  top_drivers: Driver[];
}

export interface CustomersResponse {
  total: number;
  limit: number;
  offset: number;
  rows: CustomerRow[];
}

export interface TransactionPoint {
  day: number;
  amount: number;
}

export interface OfferHistoryEntry {
  offer: string;
  offer_type: string;
  received_day: number;
  viewed: boolean;
  completed: boolean;
  spend_in_window: number;
}

export interface Customer360 {
  person_id: string;
  gender: string | null;
  age: number | null;
  income: number | null;
  became_member_on: string;
  tenure_days: number;
  segment: string;
  rfm: {
    recency_days: number;
    frequency: number;
    monetary: number;
    r_score: number;
    f_score: number;
    m_score: number;
    rfm_cell: string;
    rfm_score: number;
  };
  avg_order_value: number;
  clv_12m: number;
  expected_lifetime_months: number;
  churn_prob: number;
  churn_risk_band: RiskBand;
  churned_flag: number;
  top_drivers: Driver[];
  recommended_action: string;
  engagement: {
    offers_received: number;
    offers_viewed: number;
    offers_completed: number;
    offer_view_rate: number;
    offer_completion_rate: number;
  };
  transaction_timeline: TransactionPoint[];
  offer_history: OfferHistoryEntry[];
}

export interface FeatureImportance {
  feature: string;
  label: string;
  coefficient: number;
  importance: number;
  direction: string;
}

export interface ChurnDrivers {
  model: string;
  test_roc_auc: number;
  xgboost_roc_auc: number | null;
  target: string;
  note: string;
  feature_importances: FeatureImportance[];
}

export interface OfferTypeUplift {
  offer_type: string;
  instances: number;
  view_rate: number;
  completion_rate: number;
  avg_spend_viewed: number;
  avg_spend_not_viewed: number;
  spend_uplift: number;
}

export interface OfferUplift {
  offer_id: string;
  label: string;
  offer_type: string;
  difficulty: number;
  reward: number;
  instances: number;
  view_rate: number;
  completion_rate: number;
  avg_spend: number;
}

export interface UpliftResponse {
  by_offer_type: OfferTypeUplift[];
  by_offer: OfferUplift[];
  segment_options: string[];
  offer_type_options: string[];
}

export interface CampaignRequest {
  offer_type: string;
  target_segment?: string;
  audience_size: number;
}

export interface CampaignResult {
  inputs: { offer_type: string; target_segment: string; audience_size: number };
  historical_instances: number;
  expected_view_rate: number;
  expected_completion_rate: number;
  expected_responders: number;
  incremental_spend_per_customer: number;
  projected_incremental_revenue: number;
  estimated_reward_cost: number;
  projected_net_uplift: number;
  retention_lift_pp: number;
  customers_retained: number;
  roi: number | null;
  error?: string;
}
