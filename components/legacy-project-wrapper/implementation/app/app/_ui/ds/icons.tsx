// Small stroke icons for the status and evidence labels: each state has its own shape, so no state is told by colour
// alone. 14px, currentColor, decorative (the label's word carries the meaning).

const P = { width: 14, height: 14, viewBox: "0 0 14 14", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

export const Icon = {
  draft: () => (<svg {...P}><circle cx="7" cy="7" r="5" strokeDasharray="2 2" /></svg>),
  pending: () => (<svg {...P}><circle cx="7" cy="7" r="5" /><path d="M7 2a5 5 0 0 1 0 10z" fill="currentColor" stroke="none" /></svg>),
  countered: () => (<svg {...P}><path d="M2.5 5h8M8 2.5 10.5 5 8 7.5M11.5 9h-8M6 6.5 3.5 9 6 11.5" /></svg>),
  approved: () => (<svg {...P}><circle cx="7" cy="7" r="5.5" /><path d="m4.6 7.2 1.7 1.7 3.2-3.5" /></svg>),
  launched: () => (<svg {...P}><path d="M3.5 10.5 10.5 3.5M5.5 3.5h5v5" /><path d="M2.5 12h9" /></svg>),
  declined: () => (<svg {...P}><circle cx="7" cy="7" r="5.5" /><path d="m5 5 4 4M9 5 5 9" /></svg>),
  held: () => (<svg {...P}><rect x="3" y="2.5" width="8" height="9" rx="1.5" /><path d="M5.8 5.2v3.6M8.2 5.2v3.6" /></svg>),
  person: () => (<svg {...P}><circle cx="7" cy="4.6" r="2.3" /><path d="M2.6 12.2a4.4 4.4 0 0 1 8.8 0" /></svg>),
  system: () => (<svg {...P}><rect x="2" y="2" width="10" height="10" rx="2.5" /><path d="M5 7h4M7 5v4" /></svg>),
  receipt: () => (<svg {...P}><path d="M3 1.8h8v10.4l-1.6-1-1.2 1-1.2-1-1.2 1-1.2-1L3 12.2z" /><path d="m5.2 6.4 1.3 1.3 2.4-2.6" /></svg>),
  reported: () => (<svg {...P}><path d="M2.5 3h9v6h-5l-2.8 2.4V9H2.5z" /></svg>),
  unobserved: () => (<svg {...P}><circle cx="7" cy="7" r="5" strokeDasharray="1.5 2.2" /><path d="M5.6 5.6a1.5 1.5 0 1 1 1.4 2.1v.6" /><circle cx="7" cy="10" r="0.4" fill="currentColor" /></svg>),
};
