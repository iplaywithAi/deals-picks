// Cron expressions are evaluated in Africa/Nairobi on the server
export const FREQUENCIES = [
  { label: 'Every 6 hours', value: '0 */6 * * *' },
  { label: 'Every 12 hours', value: '0 */12 * * *' },
  { label: 'Daily at 02:00', value: '0 2 * * *' },
  { label: 'Daily at 08:00', value: '0 8 * * *' },
  { label: 'Every Monday at 07:00', value: '0 7 * * 1' },
  { label: 'Custom cron expression', value: 'custom' },
];

export function frequencyFor(cron) {
  return FREQUENCIES.some((f) => f.value === cron) ? cron : 'custom';
}

export function describeSchedule(cron) {
  return FREQUENCIES.find((f) => f.value === cron)?.label ?? cron;
}
