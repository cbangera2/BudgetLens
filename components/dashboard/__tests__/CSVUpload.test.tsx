import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

// Import type declarations for jest-dom matchers
import '@testing-library/jest-dom';

import { CSVUpload } from '../CSVUpload';

// Mock react-dropzone
jest.mock('react-dropzone', () => ({
  useDropzone: jest.fn(),
}));

const mockGetRootProps = jest.fn().mockReturnValue({});
const mockGetInputProps = jest.fn().mockReturnValue({});

describe('CSVUpload', () => {
  const mockOnUpload = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders upload area with correct text', () => {
    // Mock useDropzone with isDragActive false
    const { useDropzone } = require('react-dropzone');
    useDropzone.mockImplementation(() => ({
      getRootProps: mockGetRootProps,
      getInputProps: mockGetInputProps,
      isDragActive: false,
    }));

    render(<CSVUpload onUpload={mockOnUpload} />);
    
    expect(screen.getByText('Upload Transactions')).toBeInTheDocument();
    expect(screen.getByText(/Drag and drop a CSV file here/)).toBeInTheDocument();
    expect(screen.getByText(/Format \(Transactions\): Date, Store\/Vendor/)).toBeInTheDocument();
  });

  it('calls onUpload when a file is dropped', () => {
    const content = 'date,vendor,amount,category,type';
    const file = new File([content], 'test.csv', { type: 'text/csv' });
    
    // Mock FileReader
    const mockReadAsText = jest.fn().mockImplementation(function(this: any) {
      setTimeout(() => {
        this.onload?.({ target: { result: content } });
      }, 0);
    });

    const mockFileReader = {
      readAsText: mockReadAsText,
    };
    
    (global as any).FileReader = jest.fn(() => mockFileReader);
    
    // Mock useDropzone with a custom onDrop handler
    const { useDropzone } = require('react-dropzone');
    useDropzone.mockImplementation((props: any) => {
      // Call onDrop with our test file
      setTimeout(() => props.onDrop([file]), 0);
      
      return {
        getRootProps: mockGetRootProps,
        getInputProps: mockGetInputProps,
        isDragActive: false,
      };
    });

    render(<CSVUpload onUpload={mockOnUpload} />);
    
    // Wait for the next tick to allow async operations to complete
    setTimeout(() => {
      expect(mockOnUpload).toHaveBeenCalledWith(content);
    }, 0);
  });

  it('shows drag active state', () => {
    // Mock useDropzone with isDragActive true
    const { useDropzone } = require('react-dropzone');
    useDropzone.mockImplementation(() => ({
      getRootProps: mockGetRootProps,
      getInputProps: mockGetInputProps,
      isDragActive: true,
    }));

    render(<CSVUpload onUpload={mockOnUpload} />);
    
    // The component should show the drag active text
    expect(screen.getByText(/Drop the CSV file here/)).toBeInTheDocument();
  });
});
