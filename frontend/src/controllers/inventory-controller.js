import {
  openInventoryItem,
  openInventoryMovement,
  showInventoryHistory,
  showInventoryAssignments,
} from '../inventory.js';

export function createInventoryController(ctx) {
  async function handleAction(a, el) {
    if (a === 'inventory-prev' || a === 'inventory-next') {
      ctx.state.inventoryPage += a === 'inventory-next' ? 1 : -1;
      await ctx.loadView();
      return true;
    }

    if (a === 'inventory-new' && ctx.currentClub()?.can_manage_inventory) {
      return openInventoryItem({
        api: ctx.api,
        base: ctx.base,
        reload: ctx.loadView,
      });
    }

    if (
      [
        'inventory-edit',
        'inventory-move',
        'inventory-history',
        'inventory-assignments',
        'inventory-archive',
        'inventory-restore',
      ].includes(a) &&
      ctx.currentClub()?.can_view_inventory
    ) {
      const item = ctx.state.inventory.data.find(
        (x) => String(x.id) === el.dataset.id
      );
      if (!item) return true;

      if (a === 'inventory-history') {
        return showInventoryHistory({ item, api: ctx.api, base: ctx.base });
      }

      if (a === 'inventory-assignments') {
        return showInventoryAssignments({
          item,
          api: ctx.api,
          base: ctx.base,
          reload: ctx.loadView,
          canManage: ctx.currentClub()?.can_manage_inventory,
        });
      }

      if (!ctx.currentClub()?.can_manage_inventory) return true;

      if (a === 'inventory-edit') {
        return openInventoryItem({
          item,
          api: ctx.api,
          base: ctx.base,
          reload: ctx.loadView,
        });
      }

      if (a === 'inventory-move') {
        return openInventoryMovement({
          item,
          api: ctx.api,
          base: ctx.base,
          reload: ctx.loadView,
        });
      }

      if (a === 'inventory-restore') {
        await ctx.api.post(ctx.base(`/inventory/${item.id}/restore`), {});
        await ctx.loadView();
        ctx.toast('Đã khôi phục vật tư.');
        return true;
      }

      return ctx.dialog(
        'Lưu trữ vật tư?',
        `${ctx.e(item.name)} sẽ được ẩn khỏi danh sách. Chỉ vật tư có tồn kho bằng 0 mới được lưu trữ; lịch sử được giữ lại.`,
        '',
        (form) =>
          ctx.submit(
            form,
            'inventory-archive',
            async () => {
              await ctx.api.delete(ctx.base(`/inventory/${item.id}`));
              if (
                ctx.state.inventory.data.length === 1 &&
                ctx.state.inventoryPage > 1
              ) {
                ctx.state.inventoryPage--;
              }
              await ctx.loadView();
              ctx.toast('Đã lưu trữ vật tư.');
            },
            'Lưu trữ'
          )
      );
    }

    return false;
  }

  return {
    handleAction,
  };
}
