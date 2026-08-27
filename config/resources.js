// Single source of truth for the "Resources" field -> calendar color mapping.
// Consumed by server/routes/appointments.js (event color) and public/app.js (legend, dropdown).
// Values are the standard CSS named-color hex equivalents for exactly the
// colors the user specified, so "green" means green, not a designer's tint of it.
const RESOURCE_COLORS = {
  none: '#ffffff', // white
  Vet: '#008000', // green
  'Vet Tech': '#ee82ee', // violet
  Chapel: '#0000ff', // blue
  Tammy: '#fa8072', // salmon
  Office: '#800080', // purple
  Intake: '#008080', // teal
  'Social Worker': '#d2b48c', // tan
  Transporter: '#ffa500', // orange
  Marketing: '#ffff00', // yellow
};

const RESOURCE_ORDER = [
  'none',
  'Vet',
  'Vet Tech',
  'Chapel',
  'Tammy',
  'Office',
  'Intake',
  'Social Worker',
  'Transporter',
  'Marketing',
];

function colorForResource(resource) {
  return RESOURCE_COLORS[resource] || RESOURCE_COLORS.none;
}

// Simple relative-luminance check so light backgrounds (white/tan/salmon/yellow)
// get dark text and dark backgrounds (blue/purple/teal/green) get white text.
function textColorForBackground(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#1a1a1a' : '#ffffff';
}

module.exports = { RESOURCE_COLORS, RESOURCE_ORDER, colorForResource, textColorForBackground };
