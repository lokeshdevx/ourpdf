import {
  ArrowUpDown, Combine, Crop, Droplets, Eye, FileImage, FileMinus, FileOutput, FilePen, FolderOpen, FormInput, HardDrive, Highlighter, Image as ImageIcon, ImagePlus, Keyboard, Layers, Minimize2, PenLine,
  RotateCw, ScanText, Search, ShieldCheck, Split, Type, type LucideIcon,
} from 'lucide-react'

const MAP: Record<string, LucideIcon> = {
  ArrowUpDown, Combine, Crop, Droplets, Eye, FileImage, FileMinus, FileOutput, FilePen, FolderOpen, FormInput, HardDrive, Highlighter, Image: ImageIcon, ImagePlus, Keyboard, Layers, Minimize2, PenLine,
  RotateCw, ScanText, Search, ShieldCheck, Split, Type,
}

export function Icon({ name, className }: { name: string; className?: string }) {
  const C = MAP[name] ?? Layers
  return <C className={className} aria-hidden />
}
