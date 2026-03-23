/**
 * Tema centralizado para react-select
 * Usa la paleta principal de la app (App.css).
 * Importar en cualquier componente que use <Select />.
 */
export const selectStyles = {
  control: (base, state) => ({
    ...base,
    backgroundColor: '#0f172a',
    borderColor: state.isFocused ? '#2563eb' : '#334155',
    borderRadius: '10px',
    padding: '2px',
    color: '#f8fafc',
    boxShadow: state.isFocused ? '0 0 0 2px rgba(37, 99, 235, 0.2)' : 'none',
    '&:hover': {
      borderColor: '#2563eb',
    }
  }),
  menu: (base) => ({
    ...base,
    backgroundColor: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '10px',
    zIndex: 100
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isFocused ? 'rgba(37, 99, 235, 0.15)' : 'transparent',
    color: state.isFocused ? '#60a5fa' : '#cbd5e1',
    cursor: 'pointer',
    '&:active': {
      backgroundColor: 'rgba(37, 99, 235, 0.25)'
    }
  }),
  singleValue: (base) => ({
    ...base,
    color: '#f8fafc'
  }),
  input: (base) => ({
    ...base,
    color: '#f8fafc'
  }),
  placeholder: (base) => ({
    ...base,
    color: '#64748b'
  }),
  dropdownIndicator: (base) => ({
    ...base,
    color: '#64748b',
    '&:hover': {
      color: '#2563eb'
    }
  }),
  indicatorSeparator: (base) => ({
    ...base,
    backgroundColor: '#334155'
  }),
  multiValue: (base) => ({
    ...base,
    backgroundColor: 'rgba(37, 99, 235, 0.15)',
    borderRadius: '6px'
  }),
  multiValueLabel: (base) => ({
    ...base,
    color: '#f8fafc'
  }),
  multiValueRemove: (base) => ({
    ...base,
    color: '#94a3b8',
    '&:hover': {
      backgroundColor: 'rgba(239, 68, 68, 0.2)',
      color: '#ef4444'
    }
  })
}
