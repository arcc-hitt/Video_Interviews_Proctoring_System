// Debug component to check environment variables
// Add this temporarily to your App.tsx to verify env vars

export const EnvDebug = () => {
  const envVars = {
    VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL,
    VITE_WS_URL: import.meta.env.VITE_WS_URL,
    VITE_NODE_ENV: import.meta.env.VITE_NODE_ENV,
    MODE: import.meta.env.MODE,
    PROD: import.meta.env.PROD,
    DEV: import.meta.env.DEV
  };

  return (
    <div style={{ 
      position: 'fixed', 
      top: 0, 
      right: 0, 
      background: 'black', 
      color: 'white', 
      padding: '10px', 
      fontSize: '12px',
      maxWidth: '400px',
      zIndex: 9999
    }}>
      <h3>Environment Variables Debug</h3>
      <pre>{JSON.stringify(envVars, null, 2)}</pre>
    </div>
  );
};

// Add <EnvDebug /> to your App.tsx temporarily to check if env vars are loaded