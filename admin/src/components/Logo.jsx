export default function Logo({ size = 48 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style={{ stopColor: '#7c3aed' }}/>
          <stop offset="100%" style={{ stopColor: '#4f46e5' }}/>
        </linearGradient>
      </defs>
      <path d="M6 10C6 7.79086 7.79086 6 10 6H28C30.2091 6 32 7.79086 32 10V22C32 24.2091 30.2091 26 28 26H14L8 32V26H10C7.79086 26 6 24.2091 6 22V10Z" fill="url(#logoGrad)"/>
      <path d="M16 18C16 15.7909 17.7909 14 20 14H38C40.2091 14 42 15.7909 42 18V30C42 32.2091 40.2091 34 38 34H36V40L30 34H20C17.7909 34 16 32.2091 16 30V18Z" fill="url(#logoGrad)" fillOpacity="0.7"/>
    </svg>
  )
}