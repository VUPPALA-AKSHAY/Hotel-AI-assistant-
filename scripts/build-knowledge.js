#!/usr/bin/env node
/**
 * Builds src/hotel/hotel-knowledge.json from src/hotel/hotel-knowledge.md.
 * Run via: npm run build:knowledge
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src', 'hotel', 'hotel-knowledge.md');
const OUT = path.join(__dirname, '..', 'src', 'hotel', 'hotel-knowledge.json');

const markdown = fs.readFileSync(SRC, 'utf8');
const lines = markdown.split(/\r?\n/);

const keyValueSections = new Set(['META', 'PROPERTY', 'POLICIES']);
const itemSections = new Set(['ROOMS', 'AMENITIES', 'DINING', 'SERVICES', 'NEARBY', 'SPA & WELLNESS', 'EVENTS & WEDDINGS', 'EXPERIENCES', 'SAFETY & SECURITY', 'SEASONAL', 'BUDGET TIERS']);

function parseKeyValue(itemLines) {
  // Returns object from "Key: Value" lines; bullets after a key become an array.
  const out = {};
  let currentKey = null;
  const listKeys = new Set(['Amenities']);

  for (const line of itemLines) {
    const trimmed = line.trim();
    if (!trimmed) {
      currentKey = null;
      continue;
    }
    const match = trimmed.match(/^([A-Za-z][A-Za-z0-9 &'\/-]*):\s?(.*)$/);
    if (match) {
      currentKey = match[1].trim();
      let value = match[2].trim();
      if (listKeys.has(currentKey)) {
        out[currentKey] = value ? [value] : [];
      } else {
        out[currentKey] = value;
      }
    } else if (currentKey && listKeys.has(currentKey) && /^[-*•]\s+/.test(trimmed)) {
      out[currentKey].push(trimmed.replace(/^[-*•]\s+/, '').trim());
    }
  }
  return out;
}

function parseMarkdown(lines) {
  const sections = {};
  let currentSection = null;
  let currentItem = null;
  let currentBlock = [];

  const flushItem = () => {
    if (!currentItem || !currentBlock.length) return;
    if (!sections[currentSection]) sections[currentSection] = [];
    if (currentSection === 'FAQ') {
      const q = currentItem.replace(/^Q:\s*/i, '').trim();
      const aLine = currentBlock.find((l) => /^Answer:\s?/i.test(l.trim()));
      sections[currentSection].push({
        question: q,
        answer: aLine ? aLine.trim().replace(/^Answer:\s?/i, '') : '',
      });
    } else {
      sections[currentSection].push({ name: currentItem, ...parseKeyValue(currentBlock) });
    }
    currentBlock = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^##\s+/.test(line)) {
      flushItem();
      currentSection = line.replace(/^##\s+/, '').trim();
      currentItem = null;
      continue;
    }
    if (/^###\s+/.test(line)) {
      flushItem();
      currentItem = line.replace(/^###\s+/, '').trim();
      continue;
    }
    if (currentSection) {
      if (currentItem) {
        currentBlock.push(line);
      } else if (keyValueSections.has(currentSection)) {
        // Key/value section (e.g. POLICIES) - collect lines, parse later
        sections[currentSection + '_kv'] = sections[currentSection + '_kv'] || [];
        sections[currentSection + '_kv'].push(line);
      } else {
        // Section-level line (e.g. notes under ROOMS)
        if (line.trim()) {
          sections[currentSection + '_notes'] = sections[currentSection + '_notes'] || [];
          sections[currentSection + '_notes'].push(line.trim());
        }
      }
    }
  }
  flushItem();
  return sections;
}

const parsed = parseMarkdown(lines);
const output = {
  source: { file: 'hotel-knowledge.md', generated: new Date().toISOString() },
  meta: parseKeyValue(parsed['META'] || []),
  property: parseKeyValue(parsed['PROPERTY'] || []),
  rooms: parsed['ROOMS'] || [],
  amenities: parsed['AMENITIES'] || [],
  dining: parsed['DINING'] || [],
  policies: parseKeyValue(parsed['POLICIES_kv'] || []),
  services: parsed['SERVICES'] || [],
  faqs: parsed['FAQ'] || [],
  nearby: parsed['NEARBY'] || [],
  spa: parsed['SPA & WELLNESS'] || [],
  events: parsed['EVENTS & WEDDINGS'] || [],
  experiences: parsed['EXPERIENCES'] || [],
  safety: parsed['SAFETY & SECURITY'] || [],
  seasonal: parsed['SEASONAL'] || [],
  budget_tiers: parsed['BUDGET TIERS'] || [],
  notes: parsed['ROOMS_notes'] || [],
};

fs.writeFileSync(OUT, JSON.stringify(output, null, 2) + '\n', 'utf8');
console.log(`Built ${OUT}`);
console.log(`  rooms: ${output.rooms.length}, amenities: ${output.amenities.length}, dining: ${output.dining.length}, services: ${output.services.length}, faqs: ${output.faqs.length}, nearby: ${output.nearby.length}, spa: ${output.spa.length}, events: ${output.events.length}, experiences: ${output.experiences.length}, safety: ${output.safety.length}, seasonal: ${output.seasonal.length}, budget_tiers: ${output.budget_tiers.length}`);