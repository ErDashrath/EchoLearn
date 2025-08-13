import { useState } from "react";

export default function TestPage() {
  const [count, setCount] = useState(0);

  return (
    <div style={{ 
      minHeight: "100vh", 
      display: "flex", 
      alignItems: "center", 
      justifyContent: "center", 
      backgroundColor: "#f3f4f6" 
    }}>
      <div style={{ 
        textAlign: "center", 
        padding: "2rem", 
        backgroundColor: "white", 
        borderRadius: "8px", 
        boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)" 
      }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: "bold", marginBottom: "1rem" }}>
          EchoLearn Test Page
        </h1>
        <p style={{ marginBottom: "1rem" }}>Count: {count}</p>
        <button 
          onClick={() => setCount(count + 1)}
          style={{
            backgroundColor: "#3b82f6",
            color: "white",
            padding: "0.5rem 1rem",
            borderRadius: "4px",
            border: "none",
            cursor: "pointer"
          }}
        >
          Increment
        </button>
        <p style={{ marginTop: "1rem", fontSize: "0.875rem", color: "#6b7280" }}>
          If you can see this, React is working!
        </p>
      </div>
    </div>
  );
}
