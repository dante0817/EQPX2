import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Network,
  Printer,
  RefreshCw,
  Send,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { EQPEvent } from '../data/eqpData';
import {
  DataPrintConfig,
  formatDataPrintText,
  HostPrinterStatus,
} from '../utils/dataPrint';
import type { MagnitudeFreshnessInspection } from '../utils/magnitudeEngine';
import { DataPrintSheet } from './DataPrintSheet';

interface DataPrintOptionsModalProps {
  open: boolean;
  isCheckingPrinter: boolean;
  isPrintingDirect: boolean;
  printerStatus: HostPrinterStatus | null;
  printPreviewActive: boolean;
  printableSheetUrl: string | null;
  printPreviewPdfUrl: string | null;
  printPreviewNotice: string | null;
  printError: string | null;
  networkPrinterAddress: string;
  onChangeNetworkPrinterAddress: (addr: string) => void;
  event: EQPEvent;
  freshness?: MagnitudeFreshnessInspection;
  primaryLocationLabel: string;
  faultGeneratorLabel: string | null;
  config: DataPrintConfig;
  onChangeConfig: (next: DataPrintConfig) => void;
  onRecheckAndPrintDefault: () => void;
  onPrintToSpecificPrinter: (printerName: string) => void;
  onPrintToNetworkPrinter: (networkAddress: string) => void;
  onBrowserPrintData: () => void;
  onClearPrintPreview: () => void;
  onDownloadDataPdf: () => void;
  onDownloadDataText: (formattedText: string) => void;
  onPrintBulletinInstead: () => void;
  onCancel: () => void;
}

export const DataPrintOptionsModal: React.FC<DataPrintOptionsModalProps> = ({
  open,
  isCheckingPrinter,
  isPrintingDirect,
  printerStatus,
  printPreviewActive,
  printableSheetUrl,
  printPreviewPdfUrl,
  printPreviewNotice,
  printError,
  networkPrinterAddress,
  onChangeNetworkPrinterAddress,
  event,
  freshness,
  primaryLocationLabel,
  faultGeneratorLabel,
  config,
  onChangeConfig,
  onRecheckAndPrintDefault,
  onPrintToSpecificPrinter,
  onPrintToNetworkPrinter,
  onBrowserPrintData,
  onClearPrintPreview,
  onDownloadDataPdf,
  onDownloadDataText,
  onPrintBulletinInstead,
  onCancel,
}) => {
  const [showTextSnippet, setShowTextSnippet] = useState(false);
  const [previewMode, setPreviewMode] = useState<'sheet' | 'text' | 'pdf'>('sheet');
  const [copiedText, setCopiedText] = useState(false);

  const previewText = useMemo(
    () =>
      formatDataPrintText({
        event,
        primaryLocationLabel,
        faultGeneratorLabel,
        config,
        freshness,
      }),
    [event, primaryLocationLabel, faultGeneratorLabel, config, freshness]
  );

  if (!open) return null;

  const statusMessage =
    printerStatus?.reason ||
    'No connected default printer was detected on the host print spooler.';

  const availableNonDefaultPrinters = (printerStatus?.printers ?? []).filter(
    (p) => p.status !== 'offline'
  );

  const toggleField = (key: keyof Omit<DataPrintConfig, 'orientation'>) => {
    onChangeConfig({
      ...config,
      [key]: !config[key],
    });
  };

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(previewText);
      setCopiedText(true);
      window.setTimeout(() => setCopiedText(false), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-3 sm:p-4 print:hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="data-print-options-title"
      onClick={onCancel}
    >
      <div
        className="bg-[#f0f2f5] border border-slate-500 rounded-md shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title Bar */}
        <div className="bg-gradient-to-r from-[#0b4a8f] to-[#1d6bc2] text-white px-3.5 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Printer className="w-4 h-4 text-amber-300 shrink-0" />
            <h2 id="data-print-options-title" className="text-xs font-semibold truncate">
              {printPreviewActive
                ? 'Data Print — Printable Sheet & System Printer Dispatch'
                : 'Data Print — No Connected Default Printer'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close Data Print Options"
            className="p-1 rounded hover:bg-white/20 text-white/90 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {printPreviewActive ? (
          <>
            <div className="flex-1 overflow-y-auto bg-slate-100 p-4 space-y-3 text-xs">
              {printPreviewNotice && (
                <div className="bg-blue-50 border border-blue-200 rounded-md px-3 py-2 text-[11px] text-blue-950 flex flex-wrap items-center justify-between gap-2">
                  <span className="flex-1 min-w-[220px]">{printPreviewNotice}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setPreviewMode('sheet')}
                      className={`px-2 py-0.5 rounded font-medium ${
                        previewMode === 'sheet'
                          ? 'bg-blue-600 text-white'
                          : 'bg-white border border-blue-200 text-blue-800'
                      }`}
                    >
                      Print Sheet
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewMode('text')}
                      className={`px-2 py-0.5 rounded font-medium ${
                        previewMode === 'text'
                          ? 'bg-blue-600 text-white'
                          : 'bg-white border border-blue-200 text-blue-800'
                      }`}
                    >
                      Text Report
                    </button>
                    {printPreviewPdfUrl && (
                      <button
                        type="button"
                        onClick={() => setPreviewMode('pdf')}
                        className={`px-2 py-0.5 rounded font-medium ${
                          previewMode === 'pdf'
                            ? 'bg-blue-600 text-white'
                            : 'bg-white border border-blue-200 text-blue-800'
                        }`}
                      >
                        PDF Preview
                      </button>
                    )}
                  </div>
                </div>
              )}

              {previewMode === 'sheet' && (
                <div className="max-w-3xl mx-auto">
                  <DataPrintSheet
                    event={event}
                    freshness={freshness}
                    primaryLocationLabel={primaryLocationLabel}
                    faultGeneratorLabel={faultGeneratorLabel}
                    config={config}
                    previewVisible={true}
                  />
                </div>
              )}

              {previewMode === 'text' && (
                <pre className="p-3 bg-slate-900 text-slate-100 rounded border border-slate-700 font-mono text-[10px] leading-relaxed overflow-auto max-h-[430px] whitespace-pre">
                  {previewText}
                </pre>
              )}

              {previewMode === 'pdf' && printPreviewPdfUrl && (
                <div className="border border-slate-300 rounded overflow-hidden bg-white">
                  <object
                    data={printPreviewPdfUrl}
                    type="application/pdf"
                    className="w-full h-[420px]"
                    aria-label="EQP Data Printable PDF Preview"
                  >
                    <div className="p-6 text-center space-y-2 text-slate-700">
                      <div className="font-semibold">
                        Inline PDF plugin preview is restricted in this browser frame.
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Use <strong>Open Printable Page &amp; Print</strong> or{' '}
                        <strong>Download Print PDF</strong> below to send directly to your printer.
                      </div>
                    </div>
                  </object>
                </div>
              )}
            </div>

            <div className="bg-[#f0f2f5] border-t border-slate-300 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
              <button
                type="button"
                onClick={onClearPrintPreview}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-400 bg-white text-slate-800 font-medium hover:bg-slate-100"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to Options
              </button>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void handleCopyText();
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-400 bg-white text-slate-800 font-medium hover:bg-slate-100"
                >
                  {copiedText ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-slate-600" />
                  )}
                  {copiedText ? 'Copied' : 'Copy Text'}
                </button>

                {printableSheetUrl && (
                  <a
                    href={printableSheetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded bg-blue-600 text-white font-semibold hover:bg-blue-700 shadow-xs"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Open Printable Page &amp; Print
                  </a>
                )}

                <button
                  type="button"
                  onClick={onDownloadDataPdf}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-emerald-500 bg-emerald-50 text-emerald-900 font-semibold hover:bg-emerald-100"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Print PDF
                </button>

                <button
                  type="button"
                  onClick={onCancel}
                  className="px-3.5 py-1.5 rounded border border-slate-400 bg-white text-slate-800 font-medium hover:bg-slate-100"
                >
                  Close
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Body */}
            <div className="flex-1 overflow-y-auto bg-white p-4 space-y-4 text-xs">
              {/* Printer Status Notice */}
              <div className="bg-amber-50 border border-amber-300 rounded-md p-3 flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1 min-w-0">
                    <div className="font-semibold text-amber-950">
                      No Connected Default Printer Found
                    </div>
                    <p className="text-[11px] text-amber-900 leading-relaxed">
                      {statusMessage} Choose one of the printing options below, connect a LAN/OS
                      printer, or use System / Browser Print for your local computer&apos;s printer.
                    </p>
                    <div className="text-[11px] font-mono text-amber-800 truncate">
                      Target data: {event.filePath || event.filename}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isCheckingPrinter || isPrintingDirect}
                  onClick={onRecheckAndPrintDefault}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-amber-400 bg-white text-amber-900 font-semibold hover:bg-amber-100/70 disabled:opacity-50 shrink-0"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isCheckingPrinter ? 'animate-spin' : ''}`} />
                  {isCheckingPrinter
                    ? 'Checking...'
                    : isPrintingDirect
                      ? 'Printing...'
                      : 'Re-check & Print'}
                </button>
              </div>

              {printError && (
                <div className="bg-rose-50 border border-rose-300 rounded-md px-3 py-2 text-[11px] text-rose-900 font-medium">
                  {printError}
                </div>
              )}

              {/* Detected Non-Default Printers + Direct LAN Port 9100 Option */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {availableNonDefaultPrinters.length > 0 && (
                  <div className="border border-slate-200 rounded-md p-3 bg-slate-50/70 space-y-2">
                    <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                      <Printer className="w-3.5 h-3.5 text-blue-700" />
                      Other Detected Host Printers
                    </div>
                    <div className="space-y-1.5">
                      {availableNonDefaultPrinters.map((printer) => (
                        <div
                          key={printer.name}
                          className="flex items-center justify-between gap-2 bg-white border border-slate-200 rounded px-2.5 py-1.5"
                        >
                          <div className="min-w-0">
                            <div className="font-mono text-[11px] font-semibold text-slate-900 truncate">
                              {printer.name}
                            </div>
                            <div className="text-[10px] text-emerald-700 capitalize">
                              {printer.status}
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={isPrintingDirect}
                            onClick={() => onPrintToSpecificPrinter(printer.name)}
                            className="px-2.5 py-1 rounded bg-blue-600 text-white text-[11px] font-semibold hover:bg-blue-700 disabled:opacity-50 shrink-0"
                          >
                            Print Here
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div
                  className={`border border-slate-200 rounded-md p-3 bg-slate-50/70 space-y-2 ${
                    availableNonDefaultPrinters.length === 0 ? 'lg:col-span-2' : ''
                  }`}
                >
                  <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                    <Network className="w-3.5 h-3.5 text-blue-700" />
                    Direct LAN / Network Printer (TCP Port 9100)
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={networkPrinterAddress}
                      onChange={(e) => onChangeNetworkPrinterAddress(e.target.value)}
                      placeholder="Printer IP or hostname (e.g. 192.168.1.50 or 192.168.1.50:9100)"
                      className="flex-1 min-w-[200px] px-2.5 py-1.5 rounded border border-slate-300 bg-white font-mono text-[11px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      disabled={isPrintingDirect || !networkPrinterAddress.trim()}
                      onClick={() => onPrintToNetworkPrinter(networkPrinterAddress.trim())}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-800 text-white text-[11px] font-semibold hover:bg-slate-900 disabled:opacity-50"
                    >
                      <Send className="w-3 h-3" />
                      {isPrintingDirect ? 'Sending...' : 'Send to LAN Printer'}
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Streams the formatted seismic data report directly to a raw JetDirect / AppSocket
                    network printer on your local network.
                  </p>
                </div>
              </div>

              {/* Print Content & Layout Options */}
              <div className="border border-slate-200 rounded-md p-3 bg-slate-50/70 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-blue-700" />
                    EQ Data Printout Options
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowTextSnippet((prev) => !prev)}
                    className="text-[11px] font-medium text-blue-700 hover:underline"
                  >
                    {showTextSnippet ? 'Hide Text Preview' : 'Show Text Preview'}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-800">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.includeHypocenter}
                      onChange={() => toggleField('includeHypocenter')}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    Hypocenter &amp; Location Solution (IT / LAT / LON / DEPTH / RMS)
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.includePhasePicks}
                      onChange={() => toggleField('includePhasePicks')}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    Station Phase Picks Matrix (P/S, OBSp, CALCp, RESp, Amp)
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.includeMagnitudes}
                      onChange={() => toggleField('includeMagnitudes')}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    Magnitude Evaluation (Ms / Mb / ML)
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.includeLocation}
                      onChange={() => toggleField('includeLocation')}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    Reference Location Bearing &amp; Fault Source
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.includeIntensities}
                      onChange={() => toggleField('includeIntensities')}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    Reported Intensities (PEIS)
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.includeExcludedPicks}
                      onChange={() => toggleField('includeExcludedPicks')}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    Include Excluded (*) Station Picks
                  </label>
                </div>

                <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center gap-4 text-[11px]">
                  <span className="font-semibold text-slate-700">Page Orientation:</span>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer text-slate-800">
                    <input
                      type="radio"
                      name="dataPrintOrientation"
                      checked={config.orientation === 'portrait'}
                      onChange={() => onChangeConfig({ ...config, orientation: 'portrait' })}
                      className="text-blue-600 focus:ring-blue-500"
                    />
                    Portrait (A4 / Letter)
                  </label>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer text-slate-800">
                    <input
                      type="radio"
                      name="dataPrintOrientation"
                      checked={config.orientation === 'landscape'}
                      onChange={() => onChangeConfig({ ...config, orientation: 'landscape' })}
                      className="text-blue-600 focus:ring-blue-500"
                    />
                    Landscape (Wide Table)
                  </label>
                </div>

                {showTextSnippet && (
                  <pre className="mt-2 p-2.5 bg-slate-900 text-slate-100 rounded border border-slate-700 font-mono text-[10px] leading-relaxed overflow-x-auto max-h-44 whitespace-pre">
                    {previewText}
                  </pre>
                )}
              </div>

              {/* Alternative Output Options */}
              <div className="space-y-2">
                <div className="font-semibold text-slate-800">Available Print &amp; Output Options</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={onBrowserPrintData}
                    className="text-left p-3 rounded-md border border-blue-300 bg-blue-50/70 hover:bg-blue-100/80 transition-colors flex items-start gap-2.5"
                  >
                    <Printer className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-blue-950">
                        Print Using Computer / Browser Printer
                      </div>
                      <div className="text-[11px] text-blue-800 mt-0.5">
                        Opens OS Print Dialog directly (or dedicated Print Tab if preview frame blocks dialogs) for your local USB/Wi-Fi printer.
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={onDownloadDataPdf}
                    className="text-left p-3 rounded-md border border-slate-300 bg-white hover:bg-slate-50 transition-colors flex items-start gap-2.5"
                  >
                    <Download className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-slate-900">
                        Export EQ Data Sheet PDF
                      </div>
                      <div className="text-[11px] text-slate-600 mt-0.5">
                        Download an A4 {config.orientation} PDF of picks, residuals, and hypocenter data ready for printing.
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => onDownloadDataText(previewText)}
                    className="text-left p-3 rounded-md border border-slate-300 bg-white hover:bg-slate-50 transition-colors flex items-start gap-2.5"
                  >
                    <FileText className="w-4 h-4 text-slate-700 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-slate-900">
                        Save Plain-Text Printout (.txt)
                      </div>
                      <div className="text-[11px] text-slate-600 mt-0.5">
                        Download fixed-width ASCII table report for dot-matrix or line printers.
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={onPrintBulletinInstead}
                    className="text-left p-3 rounded-md border border-slate-300 bg-white hover:bg-slate-50 transition-colors flex items-start gap-2.5"
                  >
                    <FileText className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-slate-900">
                        Generate Bulletin PDF Instead
                      </div>
                      <div className="text-[11px] text-slate-600 mt-0.5">
                        Create the official Earthquake Information Bulletin No. {String(event.bulletinNo).padStart(2, '0')} PDF.
                      </div>
                    </div>
                  </button>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="bg-[#f0f2f5] border-t border-slate-300 px-4 py-2.5 flex items-center justify-end gap-2 text-xs shrink-0">
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-1.5 rounded border border-slate-400 bg-white text-slate-800 font-medium hover:bg-slate-100"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
