interface DateForm {
  day: string;
  month: string;
  year: string;
}

interface MoreDateForm extends DateForm {
  hours: string;
  minutes: string;
  seconds: string;
  milliseconds: string;
}

export const getDate = <MoreType extends 'base' | 'more' | 'format' | 'formatDate'>({
  isMore,
  actualDate,
}: {
  actualDate?: Date | number;
  isMore: MoreType;
}): MoreType extends 'base' ? DateForm : MoreType extends 'format' ? string : MoreDateForm => {
  const date = actualDate ? new Date(actualDate) : new Date();

  const dateForm = {} as DateForm;

  dateForm.year = date.getFullYear().toString();
  dateForm.month = date.getMonth().toString().length == 1 ? '0' + date.getMonth() : date.getMonth().toString();
  dateForm.day = date.getDay().toString().length == 1 ? '0' + date.getDay() : date.getDate().toString();

  if (isMore === 'base') return dateForm as any;

  const moreDateForm = { ...dateForm } as MoreDateForm;

  moreDateForm.hours = date.getHours().toString().length == 1 ? '0' + date.getHours() : date.getHours().toString();
  moreDateForm.minutes = date.getMinutes().toString().length == 1 ? '0' + date.getMinutes() : date.getMinutes().toString();
  moreDateForm.seconds = date.getSeconds().toString().length == 1 ? '0' + date.getMinutes() : date.getSeconds().toString();
  moreDateForm.milliseconds = date.getMilliseconds().toString();

  if (isMore === 'format') return `${moreDateForm.year}-${moreDateForm.month}-${moreDateForm.day} ${moreDateForm.hours}:${moreDateForm.minutes}:${moreDateForm.seconds}` as any;

  if (isMore === 'formatDate') return `${moreDateForm.year}-${moreDateForm.month}-${moreDateForm.day}` as any;

  return moreDateForm as any;
};

export const timer = async (func: () => Promise<void>, ms = 200): Promise<() => void> =>
  new Promise(async (resolve) => {
    let isTime: boolean = true;
    resolve(() => (isTime = false));
    while (isTime) {
      let start = Date.now();
      try {
        await func();
      } catch (e) {}
      let delta = Date.now() - start;
      if (delta < ms) await delay(ms - delta);
    }
  });

export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
export const random = (min: number, max: number) => Math.floor(min + Math.random() * (max + 1 - min));
