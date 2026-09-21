import Image from 'next/image'
import { cn } from '@/lib/utils'

const RATIO = 534 / 564

/** The OurPDF logo mark (folded page with the PDF ribbon). */
export function BrandMark({ size = 32, className, priority }: { size?: number; className?: string; priority?: boolean }) {
  return <Image src="/logo-mark.png" alt="" width={Math.round(size * RATIO)} height={size} unoptimized priority={priority} className={cn('shrink-0 select-none object-contain', className)} draggable={false} aria-hidden />
}

/** Two-tone wordmark as in the logo: dark "Our", blue "PDF" (follows the theme). */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('font-extrabold tracking-tight', className)}>
      Our<span className="text-primary">PDF</span>
    </span>
  )
}
