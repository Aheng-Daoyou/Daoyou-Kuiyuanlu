import { sectOrganizationFacade } from '.';
import { createPostgresSectEconomyContext } from './PostgresSectOrganizationAdapters';
import {
  executeSectPlayerCommand,
  type SectCommandArgs,
} from './commandSupport';

export function executeSectShopPurchaseCommand(
  args: SectCommandArgs & { itemId: string; quantity: number },
) {
  return executeSectPlayerCommand(args, (tx) =>
    sectOrganizationFacade.economy.purchaseShopItem(
      args.userId,
      args.cultivatorId,
      args.itemId,
      args.quantity,
      createPostgresSectEconomyContext({
        q: tx,
        runtime: args.runtime,
        userId: args.userId,
      }),
    ),
  );
}

export function executeSectStipendClaimCommand(args: SectCommandArgs) {
  return executeSectPlayerCommand(args, (tx) =>
    sectOrganizationFacade.economy.claimStipend(
      args.userId,
      args.cultivatorId,
      createPostgresSectEconomyContext({
        q: tx,
        runtime: args.runtime,
        userId: args.userId,
      }),
    ),
  );
}
