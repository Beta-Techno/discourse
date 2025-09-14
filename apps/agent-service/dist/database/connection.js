"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDatabaseConnection = createDatabaseConnection;
const runs = [];
let nextId = 1;
function createDatabaseConnection(config) {
    return {
        insert: (table) => ({
            values: async (data) => {
                const record = { id: nextId++, ...data };
                runs.push(record);
                return { lastInsertRowid: record.id };
            }
        }),
        update: (table) => ({
            set: (data) => ({
                where: (condition) => {
                    console.log('Mock DB update:', data);
                    return Promise.resolve();
                }
            })
        }),
        run: async (query) => {
            console.log('Mock DB query:', query);
            return Promise.resolve();
        }
    };
}
//# sourceMappingURL=connection.js.map