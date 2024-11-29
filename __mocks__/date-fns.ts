function format(date: Date, formatStr: string) {
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  if (formatStr === 'MMM yyyy') {
    return `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
  }
  return date.toISOString();
}

export { format };
