import axios from 'axios';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000/api';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

export interface HealthResponse {
  status: string;
  service: string;
  version: string;
  database: string;
  engine: string;
  timestamp: string;
}

export const fetchHealthCheck = async (): Promise<HealthResponse> => {
  const response = await apiClient.get<HealthResponse>('/health/');
  return response.data;
};
