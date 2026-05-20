// Escape Velocity — Chart.js wrappers
let trajectoryChart = null;

const CHART_PALETTE = [
  '#4A148C', '#B71C1C', '#1565C0', '#E65100',
  '#2E7D32', '#6A1B9A', '#0277BD', '#AD1457',
];

function createTrajectoryChart(months, prioritizedDebts, investments) {
  const canvas = document.getElementById('trajectory-chart');
  if (!canvas) return;
  if (trajectoryChart) { trajectoryChart.destroy(); trajectoryChart = null; }

  const ctx    = canvas.getContext('2d');
  const labels = months.map(m => `M${m.month}`);

  // Total debt line (bold, filled)
  const totalDataset = {
    label: 'Total Debt',
    data: months.map(m => Math.round(m.totalDebtRemaining)),
    borderColor: '#1a1a2e',
    backgroundColor: 'rgba(26,26,46,0.06)',
    borderWidth: 3,
    fill: true,
    pointRadius: 0,
    tension: 0.35,
    order: 0,
  };

  // Per-debt lines
  const debtDatasets = prioritizedDebts.map((debt, i) => ({
    label: debt.name,
    data: months.map(m => Math.round(Math.max(0, m.balances[i] || 0))),
    borderColor: CHART_PALETTE[i % CHART_PALETTE.length],
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    pointRadius: 0,
    tension: 0.35,
    order: i + 1,
  }));

  // Investment balance lines (dashed green)
  const investDatasets = (investments || []).map((inv, j) => ({
    label: inv.label,
    data: months.map(m => Math.round(m.investBalances?.[j] || 0)),
    borderColor: '#1B5E20',
    backgroundColor: 'transparent',
    borderDash: [5, 4],
    borderWidth: 1.5,
    pointRadius: 0,
    tension: 0.35,
    order: prioritizedDebts.length + j + 1,
  }));

  trajectoryChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [totalDataset, ...debtDatasets, ...investDatasets],
    },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            boxWidth: 12,
            font: { size: 12 },
            padding: 14,
            usePointStyle: true,
          },
        },
        tooltip: {
          backgroundColor: 'rgba(26,26,46,0.92)',
          padding: 12,
          callbacks: {
            label: ctx => `  ${ctx.dataset.label}: ฿${ctx.parsed.y.toLocaleString()}`,
          },
        },
      },
      scales: {
        x: {
          ticks: {
            maxTicksLimit: 13,
            font: { size: 11 },
            color: '#64748b',
          },
          grid: { color: 'rgba(0,0,0,0.04)' },
        },
        y: {
          beginAtZero: true,
          ticks: {
            callback: v => v >= 1000000 ? '฿' + (v/1000000).toFixed(1) + 'M'
                         : v >= 1000    ? '฿' + (v/1000).toFixed(0) + 'k'
                         : '฿' + v,
            font: { size: 11 },
            color: '#64748b',
          },
          grid: { color: 'rgba(0,0,0,0.04)' },
        },
      },
    },
  });
}
