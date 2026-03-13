'use strict';
require('dotenv').config();
const express = require('express');
const helmet  = require('helmet');
const cors    = require('cors');

const app  = express();
const PORT = process.env.PORT || 3007;
app.use(helmet()); app.use(cors()); app.use(express.json());

// ── PT-BR Sentiment Lexicon ───────────────────────────────────
// Each word has a stress weight (positive = stress-inducing, negative = calming)
const LEXICON = {
  // High stress triggers
  'urgente': 4, 'urgência': 4, 'absurdo': 4, 'inaceitável': 5, 'inadmissível': 5,
  'horrível': 4, 'terrível': 4, 'péssimo': 4, 'lamentável': 4, 'ridículo': 4,
  'processo': 3, 'jurídico': 4, 'advogado': 4, 'procon': 4, 'denúncia': 4,
  'cancelar': 3, 'cancelamento': 3, 'reembolso': 3, 'estorno': 3, 'fraude': 5,
  'mentira': 4, 'enganado': 4, 'enganaram': 4, 'ludibriado': 4,
  'frustrado': 3, 'frustração': 3, 'decepcionado': 3, 'decepção': 3,
  'irritado': 3, 'raiva': 4, 'furioso': 5, 'indignado': 4,
  'preocupado': 2, 'preocupação': 2, 'ansioso': 2,
  'problema': 2, 'problemas': 2, 'erro': 2, 'falha': 2, 'bug': 2,
  'atraso': 2, 'atrasado': 2, 'atrasaram': 2, 'demora': 2, 'demorou': 2,
  'prazo': 1, 'deadline': 1, 'urgência': 3,
  // Mild concern
  'dúvida': 1, 'dúvidas': 1, 'confuso': 1, 'confusão': 1, 'complicado': 1,
  'difícil': 1, 'impossível': 3, 'não consigo': 2, 'não funciona': 2,
  // Stress amplifiers
  'muito': 0.5, 'bastante': 0.5, 'extremamente': 1, 'totalmente': 0.5,
  'absolutamente': 0.5, 'completamente': 0.5, 'jamais': 1, 'nunca': 0.5,
  '!!!': 1, '??': 0.5,
  // Calming words (negative stress)
  'obrigado': -2, 'obrigada': -2, 'agradeço': -2, 'grato': -2, 'grata': -2,
  'ótimo': -2, 'excelente': -3, 'perfeito': -2, 'maravilhoso': -3,
  'satisfeito': -2, 'satisfeita': -2, 'feliz': -2, 'contente': -2,
  'tranquilo': -2, 'tranquila': -2, 'calmo': -2, 'certo': -1,
  'claro': -1, 'combinado': -2, 'entendido': -1, 'compreendo': -1,
  'tudo bem': -2, 'ok': -1, 'concordo': -1, 'adorei': -2,
};

// Negation words — invert next word weight
const NEGATIONS = new Set(['não','nem','nunca','jamais','nada','nenhum','nenhuma']);

function analyzePTBR(text) {
  const normalized = text.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents for matching
    .replace(/[!?]{2,}/g, match => ' ' + match.slice(0,3) + ' ');

  const words = normalized.split(/\s+/);
  let totalWeight = 0;
  let wordCount   = 0;
  let negated     = false;

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (NEGATIONS.has(w)) { negated = true; continue; }

    let weight = LEXICON[w] ?? 0;
    if (weight !== 0) {
      if (negated) weight = -weight * 0.7; // negation softens
      totalWeight += weight;
      wordCount++;
    }
    if (i > 0 && weight !== 0) negated = false; // reset after matching word
  }

  // Also check bigrams (two-word phrases)
  for (let i = 0; i < words.length - 1; i++) {
    const bigram = words[i] + ' ' + words[i+1];
    if (LEXICON[bigram]) { totalWeight += LEXICON[bigram]; wordCount++; }
  }

  // Normalize: map to 0–100 stress score
  const rawScore = wordCount > 0 ? totalWeight / Math.sqrt(wordCount) : 0;
  const stress   = Math.max(0, Math.min(100, Math.round(50 + rawScore * 8)));
  return stress;
}

function stressLabel(score) {
  if (score < 20) return { level: 'calm',    label: 'Calmo',          color: 'green',  tip: null };
  if (score < 40) return { level: 'mild',    label: 'Leve Tensão',    color: 'yellow', tip: 'Use linguagem empática. Reconheça a preocupação antes de resolver.' };
  if (score < 65) return { level: 'tense',   label: 'Tenso',          color: 'orange', tip: 'Faça perguntas abertas. Deixe o contato falar. Ofereça solução concreta.' };
  if (score < 85) return { level: 'high',    label: 'Alto Estresse',  color: 'red',    tip: 'ATENÇÃO: Escale para gerente ou ofereça ligação imediata. Não argumente.' };
  return           { level: 'critical', label: 'Estresse Crítico', color: 'darkred', tip: 'CRÍTICO: Parar negociação. Resolver problema primeiro, venda depois.' };
}

// ── Routes ────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ service: 'sentiment-service', status: 'ok' }));

// Analyze single message
app.post('/sentiment/analyze', async (req, res) => {
  const { text, message_id, contact_id } = req.body;
  if (!text || text.trim().length < 2) return res.json({ stress_score: 0, ...stressLabel(0) });

  let stress;
  if (process.env.USE_AWS_COMPREHEND === 'true') {
    // AWS Comprehend (prod) — same interface, swapped implementation
    const { ComprehendClient, DetectSentimentCommand } = require('@aws-sdk/client-comprehend');
    const client = new ComprehendClient({ region: 'sa-east-1' });
    const result = await client.send(new DetectSentimentCommand({ Text: text, LanguageCode: 'pt' }));
    const { Sentiment: s, SentimentScore: sc } = result;
    stress = s === 'NEGATIVE' ? Math.round(50 + sc.Negative * 50)
           : s === 'POSITIVE' ? Math.round(sc.Positive * 30)
           : s === 'MIXED'    ? Math.round(35 + sc.Negative * 30)
           : 40;
  } else {
    stress = analyzePTBR(text);
  }

  res.json({ message_id, contact_id, stress_score: stress, ...stressLabel(stress) });
});

// Analyze full conversation history → trend
app.post('/sentiment/conversation', async (req, res) => {
  const { messages } = req.body; // [{ text, direction:'in'|'out' }]
  if (!Array.isArray(messages) || !messages.length) return res.json({ avg_stress: 0, trend: 'stable' });

  const inbound = messages.filter(m => m.direction === 'in' && m.text?.length > 2);
  if (!inbound.length) return res.json({ avg_stress: 0, trend: 'stable', message_count: 0 });

  const scores = inbound.map(m => analyzePTBR(m.text));
  const avg    = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

  // Trend: compare first vs second half
  const mid  = Math.ceil(scores.length / 2);
  const avg1 = scores.slice(0, mid).reduce((a,b) => a+b, 0) / mid;
  const avg2 = scores.slice(mid).reduce((a,b) => a+b, 0) / Math.max(scores.length-mid, 1);
  const trend = avg2 > avg1 + 8 ? 'increasing' : avg2 < avg1 - 8 ? 'decreasing' : 'stable';

  res.json({ avg_stress: avg, trend, message_count: scores.length, scores, ...stressLabel(avg) });
});

app.listen(PORT, () => console.log(`[sentiment-service] ✓ listening on :${PORT}`));
