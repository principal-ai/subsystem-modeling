import React from 'react';
import type { ConfigurationFile } from '@principal-ai/subsystems-core';

export interface ConfigurationSelectorProps {
  /** Available configurations */
  configurations: ConfigurationFile[];

  /** Currently selected configuration name */
  selectedConfig: string;

  /** Callback when configuration changes */
  onConfigChange: (configName: string) => void;

  /** Optional custom className */
  className?: string;

  /** Optional custom styles */
  style?: React.CSSProperties;

  /** Whether to show description */
  showDescription?: boolean;

  /** Label text for the selector */
  label?: string;
}

/**
 * Configuration selector component for switching between multiple graph configurations
 *
 * @example
 * ```tsx
 * const [selectedConfig, setSelectedConfig] = useState('simple-service');
 *
 * <ConfigurationSelector
 *   configurations={loadedConfigs}
 *   selectedConfig={selectedConfig}
 *   onConfigChange={setSelectedConfig}
 *   showDescription
 * />
 * ```
 */
export const ConfigurationSelector: React.FC<ConfigurationSelectorProps> = ({
  configurations,
  selectedConfig,
  onConfigChange,
  className,
  style,
  showDescription = false,
  label = 'Graph Configuration',
}) => {
  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    onConfigChange(event.target.value);
  };

  const selectedConfigData = configurations.find((c) => c.name === selectedConfig);

  const defaultStyle: React.CSSProperties = {
    backgroundColor: 'white',
    padding: '12px 16px',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    ...style,
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '14px',
    fontWeight: 600,
    marginBottom: '8px',
    color: '#333',
  };

  const selectStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    backgroundColor: 'white',
    cursor: 'pointer',
    outline: 'none',
    transition: 'border-color 0.2s',
  };

  const infoStyle: React.CSSProperties = {
    marginTop: '8px',
    fontSize: '12px',
    color: '#666',
    lineHeight: '1.5',
  };

  if (configurations.length === 0) {
    return (
      <div className={className} style={defaultStyle}>
        <div style={{ ...labelStyle, color: '#999' }}>No configurations available</div>
      </div>
    );
  }

  return (
    <div className={className} style={defaultStyle}>
      <label style={labelStyle} htmlFor="config-selector">
        {label}
      </label>

      <select
        id="config-selector"
        value={selectedConfig}
        onChange={handleChange}
        style={selectStyle}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = '#4A90E2';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = '#ddd';
        }}
      >
        {configurations.map((config) => (
          <option key={config.name} value={config.name}>
            {config.config.metadata.name}
          </option>
        ))}
      </select>

      {selectedConfigData && showDescription && selectedConfigData.config.metadata.description && (
        <div style={infoStyle}>
          <div>{selectedConfigData.config.metadata.description}</div>
        </div>
      )}
    </div>
  );
};
