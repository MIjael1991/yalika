-- CreateTable
CREATE TABLE "product_recipes" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "notes" TEXT,
    "yieldQuantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "productId" TEXT NOT NULL,

    CONSTRAINT "product_recipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_recipe_components" (
    "id" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "recipeId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,

    CONSTRAINT "product_recipe_components_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_recipes_productId_key" ON "product_recipes"("productId");

-- CreateIndex
CREATE INDEX "product_recipes_status_idx" ON "product_recipes"("status");

-- CreateIndex
CREATE INDEX "product_recipe_components_recipeId_idx" ON "product_recipe_components"("recipeId");

-- CreateIndex
CREATE INDEX "product_recipe_components_inventoryItemId_idx" ON "product_recipe_components"("inventoryItemId");

-- CreateIndex
CREATE UNIQUE INDEX "product_recipe_components_recipeId_inventoryItemId_key" ON "product_recipe_components"("recipeId", "inventoryItemId");

-- AddForeignKey
ALTER TABLE "product_recipes" ADD CONSTRAINT "product_recipes_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_recipe_components" ADD CONSTRAINT "product_recipe_components_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "product_recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_recipe_components" ADD CONSTRAINT "product_recipe_components_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
