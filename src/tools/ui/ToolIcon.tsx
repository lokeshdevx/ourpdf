import {
  AudioLines, BookMarked, BookOpen, Code, Combine, Contrast, Crop, Droplets, EyeOff, FileArchive, FileCode, FileImage, FileKey, FilePen, FilePlus2, FileText, FileType, Fingerprint, FlipHorizontal2,
  FolderCheck, FormInput, GitCompare, Grid2x2, HardDriveDownload, Hash, IdCard, ImagePlus, Images, KeyRound, Layers, Layers2, LayoutGrid, ListOrdered, Lock, LockOpen, MessagesSquare, Minimize2,
  NotebookPen, PanelTop, PenLine, PenTool, Presentation, ReceiptIndianRupee, RotateCw, ScanLine, ScanText, Share2, Sheet, ShieldAlert, ShoppingCart, Shuffle, Sparkles, Split, SquareSlash,
  SquareSplitHorizontal, Table2, Tags, TextSearch, Type, Volume2, Workflow, Wrench, type LucideIcon,
} from 'lucide-react'

const ICONS: Record<string, LucideIcon> = {
  AudioLines, BookMarked, BookOpen, Code, Combine, Contrast, Crop, Droplets, EyeOff, FileArchive, FileCode, FileImage, FileKey, FilePen, FilePlus2, FileText, FileType, Fingerprint, FlipHorizontal2,
  FolderCheck, FormInput, GitCompare, Grid2x2, HardDriveDownload, Hash, IdCard, ImagePlus, Images, KeyRound, Layers, Layers2, LayoutGrid, ListOrdered, Lock, LockOpen, MessagesSquare, Minimize2,
  NotebookPen, PanelTop, PenLine, PenTool, Presentation, ReceiptIndianRupee, RotateCw, ScanLine, ScanText, Share2, Sheet, ShieldAlert, ShoppingCart, Shuffle, Sparkles, Split, SquareSlash,
  SquareSplitHorizontal, Table2, Tags, TextSearch, Type, Volume2, Workflow, Wrench,
}

export function ToolIcon({ name, className }: { name: string; className?: string }) {
  const C = ICONS[name] ?? Layers
  return <C className={className} aria-hidden />
}
