import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { parsePercentToBps } from '$lib/pricing';
import { getPartsMarkupBps, setPartsMarkupBps } from '$lib/server/work-order-pricing';

export const load: PageServerLoad = async () => {
  return { partsMarkupBps: await getPartsMarkupBps() };
};

export const actions: Actions = {
  save: async ({ request }) => {
    const form = await request.formData();
    const partsMarkupBps = parsePercentToBps(String(form.get('partsMarkup') ?? ''));
    if (partsMarkupBps === null) return fail(400, { error: 'Enter a percentage from 0 to 1000, with at most two decimals' });
    await setPartsMarkupBps(partsMarkupBps);
    return { success: true };
  }
};
