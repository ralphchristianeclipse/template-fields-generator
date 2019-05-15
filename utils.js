const copyTextByElement = data =>
  new Promise((resolve, reject) => {
    const textarea = document.createElement('textarea');
    textarea.value = data;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    resolve(document.body.removeChild(textarea));
  });
export const setClipboard = async data => {
  if (
    navigator &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  ) {
    await navigator.clipboard.writeText(data);
  } else {
    await copyTextByElement(data);
  }
};

export const getFieldsFromTemplate = template =>
  template
    .split('\n')
    .map(field => field.trim())
    .filter(Boolean)
    .map(field => field.replace(':', ''));

export const sleep = (timeout = 1000) =>
  new Promise(resolve => setTimeout(resolve, timeout));
