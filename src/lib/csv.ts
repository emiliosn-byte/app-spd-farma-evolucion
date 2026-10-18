export function csv(rows: (string | number | null | undefined)[][]): string {
  return (
    '\uFEFF' +
    rows
      .map((row) =>
        row
          .map((value) => {
            let text = typeof value === 'number' ? String(value).replace('.', ',') : String(value ?? '');
            // Evitar que Excel ejecute contenido introducido por una persona como una fórmula.
            if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
            return `"${text.replaceAll('"', '""')}"`;
          })
          .join(';'),
      )
      .join('\r\n')
  );
}
