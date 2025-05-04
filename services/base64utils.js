// services/base64utils.js
import { Buffer } from 'buffer';
import { Platform } from 'react-native';

// Standardized Base64 encoder function
export const encodeBase64 = (str) => {
  try {
    return Buffer.from(str, 'utf8').toString('base64');
  } catch (error) {
    console.error('Base64 encoding error:', error);
    throw error;
  }
};

// Standardized Base64 decoder function
export const decodeBase64 = (base64String) => {
  try {
    return Buffer.from(base64String, 'base64').toString('utf8');
  } catch (error) {
    console.error('Base64 decoding error:', error);
    throw error;
  }
};