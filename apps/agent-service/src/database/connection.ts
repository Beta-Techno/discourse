import { Config } from '@discourse/core';

// Simple in-memory mock database for testing
const runs: any[] = [];
let nextId = 1;

export function createDatabaseConnection(config: Config) {
  return {
    insert: (table: any) => ({
      values: async (data: any) => {
        const record = { id: nextId++, ...data };
        runs.push(record);
        return { lastInsertRowid: record.id };
      }
    }),
    update: (table: any) => ({
      set: (data: any) => ({
        where: (condition: any) => {
          // Mock update - just log it
          console.log('Mock DB update:', data);
          return Promise.resolve();
        }
      })
    }),
    run: async (query: any) => {
      console.log('Mock DB query:', query);
      return Promise.resolve();
    }
  };
}

export type Database = ReturnType<typeof createDatabaseConnection>;
