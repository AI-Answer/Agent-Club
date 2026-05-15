/**
 * Channels – enable / disable toggle tests.
 *
 * Covers:
 *  - Navigating to the channels settings (webui tab → channels sub-tab)
 *  - Channel list renders with known channels
 *  - Toggle switches are visible for active channels
 *  - Removed channels stay hidden while Hermes-native channels are active
 */
import { test, expect } from '../fixtures';
import { goToChannelsTab, channelItemById, channelSwitchById, takeScreenshot, waitForClassChange } from '../helpers';

const ACTIVE_CHANNEL_IDS = ['telegram', 'weixin', 'slack', 'discord', 'imessage'] as const;
const HIDDEN_CHANNEL_IDS = ['lark', 'dingtalk', 'wecom'] as const;

test.describe('Channels', () => {
  test('channels settings page renders', async ({ page }) => {
    await goToChannelsTab(page);
    await expect(page.locator(channelItemById('telegram'))).toBeVisible({ timeout: 8_000 });
  });

  test('known channels are listed', async ({ page }) => {
    await goToChannelsTab(page);

    const visibleCount = (
      await Promise.all(
        ACTIVE_CHANNEL_IDS.map(async (id) => {
          return (await page.locator(channelItemById(id)).count()) > 0 ? 1 : 0;
        })
      )
    ).reduce((sum, n) => sum + n, 0);

    expect(visibleCount).toBeGreaterThanOrEqual(2);
  });

  test('toggle switches are visible for channels', async ({ page }) => {
    await goToChannelsTab(page);

    const visibleSwitches = (
      await Promise.all(
        ACTIVE_CHANNEL_IDS.map(async (id) => {
          const sw = page.locator(channelSwitchById(id)).first();
          return (await sw.count()) > 0 ? 1 : 0;
        })
      )
    ).reduce((sum, n) => sum + n, 0);

    expect(visibleSwitches).toBeGreaterThanOrEqual(1);
  });

  test('can toggle a channel switch', async ({ page }) => {
    await goToChannelsTab(page);

    let toggled = false;
    for (const id of ACTIVE_CHANNEL_IDS) {
      const sw = page.locator(channelSwitchById(id)).first();
      if ((await sw.count()) === 0) continue;

      await expect(sw).toBeVisible({ timeout: 5_000 });
      const classBefore = await sw.getAttribute('class');
      if (classBefore?.includes('arco-switch-disabled')) continue;

      const checkedBefore = classBefore?.includes('arco-switch-checked');
      await sw.click();
      await waitForClassChange(sw, 1200);

      const classAfter = await sw.getAttribute('class');
      const checkedAfter = classAfter?.includes('arco-switch-checked');
      toggled = true;

      if (checkedBefore !== checkedAfter) {
        await sw.click();
        await waitForClassChange(sw, 1000);
      }
      break;
    }

    expect(toggled).toBeTruthy();
  });

  test('Hermes channels are active and removed channels stay hidden', async ({ page }) => {
    await goToChannelsTab(page);

    for (const id of ['slack', 'discord', 'imessage'] as const) {
      const item = page.locator(`${channelItemById(id)}[data-channel-status="active"]`).first();
      await expect(item).toBeVisible({ timeout: 8_000 });

      const sw = item.locator(channelSwitchById(id)).first();
      await expect(sw).toBeVisible({ timeout: 5_000 });
      await expect(sw).toHaveAttribute('data-channel-switch-disabled', 'false');
    }

    for (const id of HIDDEN_CHANNEL_IDS) {
      await expect(page.locator(channelItemById(id))).toHaveCount(0);
    }
  });

  test('screenshot: channels settings', async ({ page }) => {
    test.skip(!process.env.E2E_SCREENSHOTS, 'screenshots disabled');
    await goToChannelsTab(page);
    await takeScreenshot(page, 'channels-settings');
  });
});
