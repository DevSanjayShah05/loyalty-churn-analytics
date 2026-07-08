import { Route, Routes } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import Overview from "./pages/Overview";
import SegmentBoard from "./pages/SegmentBoard";
import ChurnRiskTable from "./pages/ChurnRiskTable";
import CustomerProfile from "./pages/CustomerProfile";
import CampaignSimulator from "./pages/CampaignSimulator";

export default function App() {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-scroll">
        <div className="topbar">
          <div>
            <div className="topbar-title">Loyalty &amp; Retention Console</div>
          </div>
          <span className="pill pill-good">Live analytics API</span>
        </div>
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/segments" element={<SegmentBoard />} />
          <Route path="/churn" element={<ChurnRiskTable />} />
          <Route path="/customers/:personId" element={<CustomerProfile />} />
          <Route path="/campaign" element={<CampaignSimulator />} />
        </Routes>
      </div>
    </div>
  );
}
