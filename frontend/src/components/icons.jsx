// Small line icons shared by the Customers and Dashboard pages.
const I = ({ children, ...p }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>{children}</svg>
);

export const IconUserPlus = (p) => (
  <I {...p}><circle cx="10" cy="8" r="3.7" /><path d="M3.5 20c.7-3.6 3.2-5.4 6.5-5.4 1.3 0 2.4.3 3.4.8" /><path d="M19 13.5v6M16 16.5h6" /></I>
);
export const IconBuildings = (p) => (
  <I {...p}><rect x="4.5" y="3.5" width="10" height="17" rx="1.6" /><path d="M14.5 9.5h4a1 1 0 0 1 1 1v10h-5" /><path d="M7.7 7.6h3.6M7.7 11h3.6M7.7 14.4h3.6" /></I>
);
export const IconPeople = (p) => (
  <I {...p}><circle cx="9" cy="8.2" r="3.4" /><path d="M2.8 19.6c.6-3.4 3-5.2 6.2-5.2s5.6 1.8 6.2 5.2" /><circle cx="17" cy="9.2" r="2.7" /><path d="M16.6 14.5c2.4.1 4.2 1.6 4.7 4.5" /></I>
);
export const IconArrowUpRight = (p) => (<I {...p}><path d="M7 17 17 7M8.5 7H17v8.5" /></I>);
export const IconChevronDown = (p) => (<I {...p}><path d="m6 9 6 6 6-6" /></I>);
export const IconChevronLeft = (p) => (<I {...p}><path d="m15 5-7 7 7 7" /></I>);
export const IconChevronRight = (p) => (<I {...p}><path d="m9 5 7 7-7 7" /></I>);
export const IconSearch = (p) => (<I {...p}><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></I>);
export const IconCheck = (p) => (<I {...p}><path d="m5 12.6 4.4 4.4L19 7.4" /></I>);
export const IconUpload = (p) => (<I {...p}><path d="M12 16V5M7.5 9.5 12 5l4.5 4.5M5 19h14" /></I>);
export const IconSpark = (p) => (<I {...p}><path d="M12 3.5 13.9 10l6.6 2-6.6 2L12 20.5 10.1 14l-6.6-2 6.6-2L12 3.5Z" /></I>);
export const IconTrash = (p) => (<I {...p}><path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.8 12.5h9.4L17.5 7M10.2 11v5.5M13.8 11v5.5" /></I>);
export const IconAlert = (p) => (<I {...p}><path d="M12 4 3.2 19.2h17.6L12 4Z" /><path d="M12 10v4.4M12 16.9v.2" /></I>);
export const IconPhone = (p) => (<I {...p}><path d="M5 4.5h3.2l1.6 4-2 1.3a11 11 0 0 0 5.4 5.4l1.3-2 4 1.6V18a1.8 1.8 0 0 1-2 1.8C10.6 19.3 4.7 13.4 4.2 6.5A1.8 1.8 0 0 1 5 4.5Z" /></I>);
export const IconMic = (p) => (<I {...p}><rect x="9" y="3.5" width="6" height="11" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5" /></I>);
export const IconMicOff = (p) => (<I {...p}><rect x="9" y="3.5" width="6" height="11" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5M4 4l16 16" /></I>);
export const IconExpand = (p) => (<I {...p}><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" /></I>);
export const IconShrink = (p) => (<I {...p}><path d="M20 10h-6V4M4 14h6v6M14 10l7-7M10 14l-7 7" /></I>);
export const IconClip = (p) => (<I {...p}><path d="m20 11.5-8.2 8.2a5 5 0 0 1-7.1-7.1l8.5-8.5a3.4 3.4 0 0 1 4.8 4.8l-8.5 8.5a1.8 1.8 0 0 1-2.5-2.5L15 7.3" /></I>);
export const IconSend = (p) => (<I {...p}><path d="M4 12 20 4l-5 16-3.6-6.4L4 12Z" /><path d="m11.4 13.6 3.2-3.2" /></I>);
export const IconGrip = (p) => (<I {...p}><circle cx="9" cy="7" r="1" /><circle cx="15" cy="7" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="9" cy="17" r="1" /><circle cx="15" cy="17" r="1" /></I>);
export const IconSpeaker = (p) => (<I {...p}><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4Z" /><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" /></I>);
export const IconKey = (p) => (<I {...p}><circle cx="8" cy="15" r="3.5" /><path d="m10.5 12.5 8-8M15.5 7.5l2.5 2.5M13.5 9.5l2 2" /></I>);
export const IconStop = (p) => (<I {...p}><rect x="6.5" y="6.5" width="11" height="11" rx="2" /></I>);
export const IconPhoneEnd = (p) => (<I {...p}><path d="M3 14.5c5.5-5 12.5-5 18 0l-1.6 2.4-3.4-1.2v-2.6a14 14 0 0 0-8 0v2.6l-3.4 1.2L3 14.5Z" /></I>);
