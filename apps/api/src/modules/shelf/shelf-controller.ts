import type { RequestHandler } from "express";
import type { ShelfStatus } from "../../generated/prisma/client.js";
import {
  addShelfBook,
  getShelfStats,
  listShelfBooks,
  removeShelfBook,
  updateShelfBook,
} from "./shelf-service.js";
import type { AddRequest, IdRequest, ListRequest, UpdateRequest } from "./shelf-schemas.js";

const stats: RequestHandler = async (_req, res, next) => {
  try {
    res.status(200).json({ data: await getShelfStats() });
  } catch (error) {
    next(error);
  }
};

const list: RequestHandler = async (_req, res, next) => {
  try {
    const { status } = res.locals.validated.query as ListRequest;
    res.status(200).json({ data: await listShelfBooks(status as ShelfStatus | undefined) });
  } catch (error) {
    next(error);
  }
};

const add: RequestHandler = async (_req, res, next) => {
  try {
    const result = await addShelfBook(res.locals.validated.body as AddRequest);
    res.status(result.restored ? 200 : 201).json({ data: result });
  } catch (error) {
    next(error);
  }
};

const update: RequestHandler = async (_req, res, next) => {
  try {
    const validated = res.locals.validated as UpdateRequest;
    const book = await updateShelfBook(validated.params.id, validated.body);
    res.status(200).json({ data: book });
  } catch (error) {
    next(error);
  }
};

const remove: RequestHandler = async (_req, res, next) => {
  try {
    const { id } = res.locals.validated.params as IdRequest;
    await removeShelfBook(id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
};

export const shelfController = { stats, list, add, update, remove };
