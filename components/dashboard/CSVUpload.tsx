"use client";

import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload } from "lucide-react";

interface CSVUploadProps {
  onUpload: (content: string) => void;
}

export function CSVUpload({ onUpload }: CSVUploadProps) {
  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    const reader = new FileReader();

    reader.onload = () => {
      const content = reader.result as string;
      onUpload(content);
    };

    reader.readAsText(file);
  }, [onUpload]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "text/csv": [".csv"],
    },
    maxFiles: 1,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload Transactions</CardTitle>
      </CardHeader>
      <CardContent>
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
            ${isDragActive ? "border-primary bg-primary/5" : "border-border"}`}
        >
          <input {...getInputProps()} />
          <Upload className="mx-auto h-8 w-8 mb-4 text-muted-foreground" />
          {isDragActive ? (
            <p>Drop the CSV file here...</p>
          ) : (
            <p>Drag and drop a CSV file here, or click to select one</p>
          )}
          <p className="text-sm text-muted-foreground mt-2">
            Format (Transactions): Date, Store/Vendor, Amount, Category, Type
          </p>
        </div>
      </CardContent>
    </Card>
  );
}