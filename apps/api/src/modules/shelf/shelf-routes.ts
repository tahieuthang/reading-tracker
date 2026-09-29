import { Router } from "express";
import { validateRequest } from "../../middleware/validate-request.js";
import { shelfController } from "./shelf-controller.js";
import {
  addRequestSchema,
  idRequestSchema,
  listRequestSchema,
  updateRequestSchema,
} from "./shelf-schemas.js";

export const shelfRouter = Router();

shelfRouter.get("/stats", shelfController.stats);
shelfRouter.get("/", validateRequest(listRequestSchema), shelfController.list);
shelfRouter.post("/", validateRequest(addRequestSchema), shelfController.add);
shelfRouter.patch("/:id", validateRequest(updateRequestSchema), shelfController.update);
shelfRouter.delete("/:id", validateRequest(idRequestSchema), shelfController.remove);
