import { Config } from '@discourse/core';
export declare function createDatabaseConnection(config: Config): {
    insert: (table: any) => {
        values: (data: any) => Promise<{
            lastInsertRowid: any;
        }>;
    };
    update: (table: any) => {
        set: (data: any) => {
            where: (condition: any) => Promise<void>;
        };
    };
    run: (query: any) => Promise<void>;
};
export type Database = ReturnType<typeof createDatabaseConnection>;
//# sourceMappingURL=connection.d.ts.map