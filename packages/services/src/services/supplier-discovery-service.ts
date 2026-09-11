import type {
  DiscoveryCriteria,
  DiscoveryResult,
  SupplierDiscoveryService,
} from '../interfaces/supplier-discovery-service';

/**
 * Application-level supplier discovery — delegates to wired discovery adapters.
 */
export class SupplierDiscoveryAppService {
  constructor(private readonly discovery: SupplierDiscoveryService) {}

  async discover(criteria: DiscoveryCriteria): Promise<DiscoveryResult[]> {
    return this.discovery.discover(criteria);
  }
}
