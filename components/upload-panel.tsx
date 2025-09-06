"use client";

import type React from "react";
import { useCallback, useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

type PickedFile = {
  id: string;
  file: File;
  uploading?: boolean;
  uploaded?: boolean;
  error?: string;
  documentId?: string;
};

type UploadedDocument = {
  id: string;
  filename: string;
  file_size: number;
  uploaded_at: string;
  metadata: {
    row_count?: number;
    headers?: string[];
  };
};

const MAX_SIZE_BYTES = 3 * 1024 * 1024; // 3MB

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const val = Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2));
  return `${val} ${sizes[i]}`;
}

function isCsvFile(file: File): boolean {
  const isCsvByType =
    file.type === "text/csv" || file.type === "application/vnd.ms-excel";
  const isCsvByName = file.name.toLowerCase().endsWith(".csv");
  return isCsvByType || isCsvByName;
}

function makeId(seed: File) {
  const base = `${seed.name}-${seed.size}-${seed.lastModified}`;
  const rand =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${base}-${rand}`;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface UploadPanelProps {
  // Add props here as needed
  onDocumentSelectionChange?: (selectedDocumentIds: string[]) => void;
}

const UploadPanel = (props: UploadPanelProps) => {
  const { onDocumentSelectionChange } = props;
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedDocuments, setUploadedDocuments] = useState<
    UploadedDocument[]
  >([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);

  // Load uploaded documents on component mount
  useEffect(() => {
    loadUploadedDocuments();
  }, []);

  // Update parent component when document selection changes
  useEffect(() => {
    if (onDocumentSelectionChange) {
      onDocumentSelectionChange(selectedDocuments);
    }
  }, [selectedDocuments, onDocumentSelectionChange]);

  const loadUploadedDocuments = async () => {
    setIsLoadingDocs(true);
    try {
      const response = await fetch("/api/documents");
      if (response.ok) {
        const result = await response.json();
        setUploadedDocuments(result.documents || []);
        // Auto-select all documents by default
        const allDocIds =
          result.documents?.map((doc: UploadedDocument) => doc.id) || [];
        setSelectedDocuments(allDocIds);
      }
    } catch (error) {
      console.error("Failed to load documents:", error);
    } finally {
      setIsLoadingDocs(false);
    }
  };

  const deleteDocument = async (documentId: string) => {
    try {
      const response = await fetch(`/api/documents?id=${documentId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setUploadedDocuments((prev) =>
          prev.filter((doc) => doc.id !== documentId)
        );
        // Remove from selected documents if it was selected
        setSelectedDocuments((prev) => prev.filter((id) => id !== documentId));
        toast.success("Document deleted successfully");
      } else {
        throw new Error("Failed to delete document");
      }
    } catch (error) {
      toast.error("Failed to delete document");
      console.error("Delete error:", error);
    }
  };

  const clearAll = () => {
    setFiles([]);
    setErrors([]);
    toast.success("Selection cleared", {
      description: "All selected files have been removed.",
    });
  };

  const addFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList) return;
      const nextErrors: string[] = [];
      const validNewOnes: PickedFile[] = [];

      Array.from(fileList).forEach((f) => {
        // Check if file is already uploaded
        const isAlreadyUploaded = uploadedDocuments.some(
          (doc) => doc.filename === f.name && doc.file_size === f.size
        );

        if (isAlreadyUploaded) {
          nextErrors.push(`File already uploaded: ${f.name}`);
          return;
        }

        if (!isCsvFile(f)) {
          nextErrors.push(`Only CSV files are allowed: ${f.name}`);
          return;
        }
        if (f.size > MAX_SIZE_BYTES) {
          nextErrors.push(
            `File exceeds 3 MB: ${f.name} (${formatBytes(f.size)})`
          );
          return;
        }
        validNewOnes.push({ id: makeId(f), file: f });
      });

      setFiles((prev) => {
        // de-dupe by name/size/mtime
        const map = new Map(
          prev.map((p) => [
            `${p.file.name}-${p.file.size}-${p.file.lastModified}`,
            p,
          ])
        );
        validNewOnes.forEach((n) => {
          const key = `${n.file.name}-${n.file.size}-${n.file.lastModified}`;
          if (!map.has(key)) map.set(key, n);
        });
        return Array.from(map.values());
      });

      setErrors(nextErrors);

      if (nextErrors.length > 0) {
        toast.error("Some files were rejected", {
          description: nextErrors.join(" • "),
        });
      }
      if (validNewOnes.length > 0) {
        const names = validNewOnes.map((v) => v.file.name).join(", ");
        toast.success("Files added", {
          description: `${validNewOnes.length} CSV ${
            validNewOnes.length > 1 ? "files" : "file"
          }: ${names}`,
        });
      }
    },
    [uploadedDocuments]
  ); // Add uploadedDocuments as dependency

  const removeFile = (id: string) => {
    const removed = files.find((f) => f.id === id);
    setFiles((prev) => prev.filter((f) => f.id !== id));
    if (removed) {
      toast.success("Removed file", {
        description: removed.file.name,
      });
    }
  };

  const uploadFile = async (
    file: PickedFile
  ): Promise<{ documentId: string; chunksStored: number }> => {
    const formData = new FormData();
    formData.append("file", file.file);

    const response = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        errorData.error || `Upload failed with status ${response.status}`
      );
    }

    const result = await response.json();
    return result;
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    setIsUploading(true);

    try {
      // Process files one by one (since we use a global vector store)
      for (const file of files) {
        try {
          // Mark file as uploading
          setFiles((prev) =>
            prev.map((f) =>
              f.id === file.id ? { ...f, uploading: true, error: undefined } : f
            )
          );

          const result = await uploadFile(file);

          // Mark file as uploaded
          setFiles((prev) =>
            prev.map((f) =>
              f.id === file.id
                ? {
                    ...f,
                    uploading: false,
                    uploaded: true,
                    documentId: result.documentId,
                  }
                : f
            )
          );

          toast.success(`Uploaded: ${file.file.name}`, {
            description: `Processed into ${result.chunksStored} chunks. Ready for chat!`,
          });

          // Reload uploaded documents
          loadUploadedDocuments();

          // Clear uploaded files from the selection list
          setFiles((prev) => prev.filter((f) => f.id !== file.id));

          // Only process one file at a time for simplicity
          break;
        } catch (error) {
          // Mark file as failed
          setFiles((prev) =>
            prev.map((f) =>
              f.id === file.id
                ? {
                    ...f,
                    uploading: false,
                    error:
                      error instanceof Error ? error.message : "Upload failed",
                  }
                : f
            )
          );

          toast.error(`Failed: ${file.file.name}`, {
            description:
              error instanceof Error ? error.message : "Upload failed",
          });
        }
      }
    } finally {
      setIsUploading(false);
    }
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(e.target.files);
    // reset value so picking the same file again retriggers change
    e.currentTarget.value = "";
  };

  const onDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragActive(false);
    addFiles(e.dataTransfer.files);
  };

  const handleDocumentSelection = (documentId: string, checked: boolean) => {
    setSelectedDocuments((prev) =>
      checked ? [...prev, documentId] : prev.filter((id) => id !== documentId)
    );
  };

  const selectAllDocuments = () => {
    setSelectedDocuments(uploadedDocuments.map((doc) => doc.id));
  };

  const clearDocumentSelection = () => {
    setSelectedDocuments([]);
  };

  return (
    <div className="flex flex-col gap-4">
      <label
        htmlFor="csv-input"
        className={[
          "flex min-h-32 w-full cursor-pointer items-center justify-center rounded-md border text-sm",
          dragActive
            ? "border-blue-500 bg-blue-50/60"
            : "border-border bg-muted/30",
          "transition-colors",
        ].join(" ")}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        aria-label="Drag and drop CSV file here or click to choose"
      >
        <div className="flex flex-col items-center gap-1 p-6 text-center">
          <span className="font-medium">Drop CSV here</span>
          <span className="text-xs text-muted-foreground">
            or click to choose a file (max 3 MB)
          </span>
        </div>
        <input
          id="csv-input"
          type="file"
          accept=".csv,text/csv,application/vnd.ms-excel"
          className="sr-only"
          onChange={onInputChange}
        />
      </label>

      {errors.length > 0 && (
        <ul className="list-disc space-y-1 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {errors.map((err, i) => (
            <li key={i}>{err}</li>
          ))}
        </ul>
      )}

      {/* Content area - now naturally sized */}
      <div className="space-y-4">
        {files.length > 0 && (
          <div className="rounded-md border p-3">
            <div className="mb-2 text-sm font-medium">Selected files</div>
            <ul className="space-y-2">
              {files.map((pf) => (
                <li
                  key={pf.id}
                  className={`flex items-center justify-between rounded px-3 py-2 ${
                    pf.uploaded
                      ? "bg-green-50 border border-green-200"
                      : pf.error
                      ? "bg-red-50 border border-red-200"
                      : pf.uploading
                      ? "bg-blue-50 border border-blue-200"
                      : "bg-muted/40"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="truncate text-sm font-medium">
                        {pf.file.name}
                      </div>
                      {pf.uploading && (
                        <span className="text-xs text-blue-600">
                          Processing...
                        </span>
                      )}
                      {pf.uploaded && (
                        <span className="text-xs text-green-600">
                          ✓ Ready for chat
                        </span>
                      )}
                      {pf.error && (
                        <span className="text-xs text-red-600">✗ Failed</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatBytes(pf.file.size)}
                    </div>
                    {pf.error && (
                      <div className="text-xs text-red-600 mt-1">
                        {pf.error}
                      </div>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => removeFile(pf.id)}
                    disabled={pf.uploading}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Uploaded Documents Section with Chat Selection */}
        {uploadedDocuments.length > 0 && (
          <div className="rounded-md border p-3">
            <div className="mb-3 text-sm font-medium flex items-center justify-between">
              <span>Uploaded Documents ({uploadedDocuments.length})</span>
              <Button
                size="sm"
                variant="outline"
                onClick={loadUploadedDocuments}
                disabled={isLoadingDocs}
              >
                {isLoadingDocs ? "Loading..." : "Refresh"}
              </Button>
            </div>

            {/* File Selection for Chat */}
            <div className="mb-3 p-2 border rounded-md bg-blue-50">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium text-blue-900">
                  Select Files for Chat:
                </h4>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={selectAllDocuments}
                    disabled={uploadedDocuments.length === 0}
                    className="text-xs h-6 px-2"
                  >
                    All
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={clearDocumentSelection}
                    disabled={selectedDocuments.length === 0}
                    className="text-xs h-6 px-2"
                  >
                    None
                  </Button>
                </div>
              </div>

              <div className="space-y-2 max-h-32 overflow-y-auto">
                {uploadedDocuments.map((doc) => (
                  <div
                    key={`select-${doc.id}`}
                    className="flex items-center space-x-2"
                  >
                    <Checkbox
                      id={`chat-${doc.id}`}
                      checked={selectedDocuments.includes(doc.id)}
                      onCheckedChange={(checked) =>
                        handleDocumentSelection(doc.id, !!checked)
                      }
                    />
                    <label
                      htmlFor={`chat-${doc.id}`}
                      className="text-sm font-medium cursor-pointer flex-1 min-w-0"
                    >
                      <div className="flex items-center gap-2">
                        <span className="truncate">{doc.filename}</span>
                        {doc.metadata?.row_count && (
                          <Badge variant="secondary" className="text-xs">
                            {doc.metadata.row_count} rows
                          </Badge>
                        )}
                      </div>
                    </label>
                  </div>
                ))}
              </div>

              {selectedDocuments.length > 0 && (
                <p className="text-xs text-blue-600 mt-2">
                  {selectedDocuments.length} file(s) selected for chat analysis
                </p>
              )}
            </div>

            {/* Document Management List */}
            <div className="text-xs text-gray-600 mb-2 font-medium">
              Manage Documents:
            </div>
            <ul className="space-y-2">
              {uploadedDocuments.map((doc) => (
                <li
                  key={doc.id}
                  className="flex items-center justify-between rounded bg-green-50 border border-green-200 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="truncate text-sm font-medium">
                        {doc.filename}
                      </div>
                      <span className="text-xs text-green-600">
                        ✓ In Database
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatBytes(doc.file_size)} •{" "}
                      {doc.metadata?.row_count || 0} rows •
                      {new Date(doc.uploaded_at).toLocaleDateString()}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => deleteDocument(doc.id)}
                  >
                    Delete
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className="bg-blue-600 text-white hover:bg-blue-700"
          disabled={files.length === 0 || isUploading}
          onClick={handleUpload}
        >
          {isUploading ? "Processing..." : "Upload & Process"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={clearAll}
          disabled={files.length === 0}
        >
          Clear All
        </Button>
      </div>
    </div>
  );
};

export default UploadPanel;
export { UploadPanel };
