CREATE INDEX "Character_createdByUserId_idx" ON "Character"("createdByUserId");
CREATE INDEX "CharacterAsset_assetId_idx" ON "CharacterAsset"("assetId");
CREATE INDEX "ProjectCharacter_characterId_idx" ON "ProjectCharacter"("characterId");
CREATE INDEX "ProjectCharacter_selectedVersionId_idx" ON "ProjectCharacter"("selectedVersionId");
