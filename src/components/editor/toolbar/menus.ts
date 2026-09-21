import type { MenuEntry } from './CommandItems'

export interface MenuDef {
  label: string
  items: MenuEntry[]
}

export const MENUS: MenuDef[] = [
  { label: 'File', items: ['file.open', 'file.openClipboard', 'file.new', 'file.importImages', '-', 'file.save', 'file.saveAs', 'file.saveAll', 'file.export', '-', 'file.print', '-', 'file.projects', 'file.exportProject', 'file.importProject', '-', 'file.metadata', '-', 'file.close', 'file.closeOthers', 'file.closeAll'] },
  { label: 'Edit', items: ['edit.undo', 'edit.redo', '-', 'edit.cut', 'edit.copy', 'edit.paste', 'edit.delete', 'edit.duplicate', 'edit.selectAll', '-', 'edit.find', 'edit.replace', '-', { sub: 'Arrange', items: ['edit.front', 'edit.forward', 'edit.backward', 'edit.back'] }, 'edit.lock', 'edit.unlock', '-', 'edit.clearHistory'] },
  { label: 'View', items: ['view.zoomIn', 'view.zoomOut', 'view.zoom100', '-', 'view.fitWidth', 'view.fitPage', 'view.fitHeight', '-', 'view.continuous', 'view.single', 'view.two', 'view.twoCover', '-', 'view.vertical', 'view.horizontal', '-', 'nav.first', 'nav.prev', 'nav.next', 'nav.last', '-', 'view.fullscreen', 'view.presentation', '-', { sub: 'Panels', items: ['view.left', 'view.right', 'view.thumbnails', 'view.outline', 'view.attachments', 'view.layers', 'view.pages'] }, { sub: 'Appearance & performance', items: ['view.theme', 'view.highContrast', 'view.reduceMotion', 'view.lowMemory'] }, 'view.settings'] },
  { label: 'Insert', items: ['text.add', 'text.heading', 'text.list', 'text.font', '-', 'image.insert', 'annotate.customStamp', 'tool.stamp', '-', 'annotate.link', '-', 'pages.addBlank', 'pages.insertPdf', '-', 'hf.header', 'hf.footer', 'hf.pageNumbers', 'hf.bates', 'wm.add'] },
  { label: 'Annotate', items: [{ sub: 'Markup', items: ['tool.highlight', 'tool.underline', 'tool.strike', 'tool.squiggly', 'annotate.markupArea'] }, 'tool.note', { sub: 'Draw', items: ['tool.pen', 'tool.pencil', 'tool.marker', 'tool.brush', 'tool.eraser'] }, { sub: 'Shapes', items: ['tool.line', 'tool.arrow', 'tool.darrow', 'tool.rect', 'tool.rrect', 'tool.ellipse', 'tool.polygon', 'tool.star', 'tool.cloud', 'tool.path'] }, 'tool.callout', '-', { sub: 'Stamps', items: ['tool.stamp', 'annotate.stampDialog', 'annotate.dateStamp', 'annotate.customStamp'] }, '-', 'text.edit', 'sec.redact', 'annotate.link', 'annotate.editLink', 'annotate.removeLink'] },
  { label: 'Organize', items: ['pages.organizer', '-', 'pages.addBlank', 'pages.delete', 'pages.duplicate', { sub: 'Rotate', items: ['pages.rotateCw', 'pages.rotateCcw', 'pages.rotate180', 'pages.resetRotation'] }, { sub: 'Move', items: ['pages.moveUp', 'pages.moveDown', 'pages.reverse', 'pages.sort', 'pages.sortOriginal'] }, '-', 'pages.extract', 'pages.split', 'file.merge', 'pages.insertPdf', 'pages.replace', '-', 'pages.copy', 'pages.paste', '-', 'pages.crop', 'pages.setup', 'pages.labels', 'pages.bookmark'] },
  { label: 'Forms', items: ['form.field-text', 'form.field-checkbox', 'form.field-radio', 'form.field-dropdown', 'form.field-listbox', 'form.field-button', 'form.field-date', 'form.field-signature', '-', 'form.fill', 'form.edit', '-', 'form.validate', 'form.reset', 'form.data', 'form.flatten'] },
  { label: 'Sign', items: ['sign.create', 'sign.date', 'sign.name', 'form.field-signature'] },
  { label: 'Convert', items: ['convert.dialog', 'convert.toPng', 'convert.toJpg', 'convert.toText', 'convert.toHtml', 'convert.exportAnnotations', 'convert.canvasToPdf', '-', 'file.importImages'] },
  { label: 'Tools', items: ['ocr.run', 'opt.compress', '-', 'sec.security', 'sec.redact', 'sec.redactText', 'sec.applyRedactions', 'sec.redactPreview', '-', 'file.metadata', 'opt.flatten', '-', 'wm.add', 'hf.header', 'hf.footer', 'hf.bates'] },
  { label: 'Help', items: ['help.tools', 'help.shortcuts', 'help.about'] },
]
