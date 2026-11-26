module.exports = {
  content: ['./src/**/*.{js,jsx}'],
  theme: { extend: {
    colors: { bg:'var(--bg)', panel:'var(--panel)', ink:'var(--ink)', mute:'var(--mute)', line:'var(--line)', soft:'var(--soft)', brick:'var(--brick)', side:'var(--side)', brick2:'var(--brick-2)', ok:'var(--ok)', warn:'var(--warn)', bad:'var(--bad)' },
    fontFamily: { sans: ['"Schibsted Grotesk"', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'] },
  } },
  plugins: [],
};
