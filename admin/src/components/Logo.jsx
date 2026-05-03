export default function Logo({ size = 34 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="lgN" x1="0" y1="0" x2="34" y2="34" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0BB878"/>
          <stop offset="1" stopColor="#6B5FED"/>
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="32" height="32" rx="10" fill="url(#lgN)"/>
      <path d="M10 10h8.5c1.9 0 3.5 1.6 3.5 3.5S20.4 17 18.5 17H14" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <path d="M14 17l5 7" stroke="white" strokeWidth="2.2" strokeLinecap="round" fill="none"/>
      <circle cx="26" cy="9" r="3.5" fill="#0BB878"/>
      <circle cx="26" cy="9" r="2" fill="white"/>
    </svg>
  )
}