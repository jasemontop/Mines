// API configuration
const API_URL = ''; // Empty string means same origin

// API helper functions
async function apiCall(endpoint, method = 'GET', data = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include' // Important for sessions
  };
  
  if (data) {
    options.body = JSON.stringify(data);
  }

  const response = await fetch(API_URL + endpoint, options);
  const result = await response.json();
  
  if (!response.ok) {
    throw new Error(result.error || 'Request failed');
  }
  
  return result;
}

// Save this as a new file or reference for converting your script
