import express from 'express';
import app from './core.js';

export default function handler(req, res) {
  return app(req, res);
}
