import { Routes, Route } from "react-router-dom";
import HomePage from "./pages/HomePage";
import JobPage from "./pages/JobPage";

export default function App() {
  return (
    <div className="min-h-screen bg-dark-950">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/jobs/:id" element={<JobPage />} />
      </Routes>
    </div>
  );
}
