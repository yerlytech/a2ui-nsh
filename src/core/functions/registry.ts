/**
 * Registry mapping catalog IDs and universal system names to executable
 * `FunctionImplementation`s.
 */

import { BASIC_CATALOG_V1_ID } from "../catalog";
import { BASIC_V1_FUNCTIONS, SYSTEM_V1_FUNCTIONS } from "./basic_functions";
import type { FunctionImplementation } from "./types";

/**
 * Holds local executable implementations for universal `@`-prefixed system
 * functions and catalog-scoped functions (Basic Catalog v1.0 and custom
 * catalogs such as `xlarge`).
 */
export class FunctionRegistry {
  private readonly systemFns = new Map<string, FunctionImplementation>();
  private readonly catalogFns = new Map<
    string,
    Map<string, FunctionImplementation>
  >();

  /** Creates a registry preloaded with `@index` and all 14 Basic Catalog v1.0 functions. */
  static withBasicV1(): FunctionRegistry {
    const registry = new FunctionRegistry();
    for (const fn of SYSTEM_V1_FUNCTIONS) {
      registry.registerSystem(fn);
    }
    registry.registerCatalog(BASIC_CATALOG_V1_ID, BASIC_V1_FUNCTIONS);
    return registry;
  }

  /** Registers a universal catalogless system function (must start with `@`). */
  registerSystem(impl: FunctionImplementation): void {
    this.systemFns.set(impl.name, impl);
  }

  /** Registers a single executable function under `catalogId`. */
  register(catalogId: string, impl: FunctionImplementation): void {
    let table = this.catalogFns.get(catalogId);
    if (!table) {
      table = new Map<string, FunctionImplementation>();
      this.catalogFns.set(catalogId, table);
    }
    table.set(impl.name, impl);
  }

  /** Registers multiple executable functions under `catalogId`. */
  registerCatalog(
    catalogId: string,
    implementations: readonly FunctionImplementation[],
  ): void {
    for (let i = 0; i < implementations.length; i += 1) {
      this.register(catalogId, implementations[i]!);
    }
  }

  /** Looks up a universal system function (e.g. `@index`). */
  getSystem(name: string): FunctionImplementation | undefined {
    return this.systemFns.get(name);
  }

  /** Looks up a catalog-scoped function by canonical catalog ID and name. */
  get(catalogId: string, name: string): FunctionImplementation | undefined {
    return this.catalogFns.get(catalogId)?.get(name);
  }

  /** True when `catalogId` has a local implementation for `name`. */
  has(catalogId: string, name: string): boolean {
    return this.catalogFns.get(catalogId)?.has(name) === true;
  }

  /** Lists function names registered locally for `catalogId`. */
  listCatalogFunctions(catalogId: string): string[] {
    const table = this.catalogFns.get(catalogId);
    return table ? Array.from(table.keys()) : [];
  }
}
