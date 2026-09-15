const fs = require('fs');
const path = require('path');
const config = require('../../../Config/config.json');

const manualCatalogPath = path.join(__dirname, '../../../Config/manual_catalog_config.json');

module.exports = {
    commandInfo: {
        name: 'shop',
        description: 'Update the item shop with a custom item',
        options: [
            {
                name: 'type',
                description: 'Type of the item',
                required: true,
                type: 3,
                choices: [
                    { name: 'Skins', value: 'Skins' },
                    { name: 'Backblings', value: 'Backblings' },
                    { name: 'Pickaxe', value: 'Pickaxe' },
                    { name: 'Gliders', value: 'Gliders' },
                    { name: 'Contrails', value: 'Contrails' },
                    { name: 'Emotes', value: 'Emotes' },
                    { name: 'Loading Screens', value: 'Loading Screens' },
                    { name: 'MusicPack', value: 'MusicPack' }
                ]
            },
            {
                name: 'id',
                description: 'The cosmetic ID to add (e.g. CID_123 or Pickaxe_ID_456)',
                required: true,
                type: 3
            },
            {
                name: 'price',
                description: 'V-Bucks price for the item',
                required: true,
                type: 4
            },
            {
                name: 'time',
                description: 'When to apply the shop update',
                required: true,
                type: 3,
                choices: [
                    { name: 'いますぐ', value: 'いますぐ' },
                    { name: 'いつもどうり', value: 'いつもどうり' }
                ]
            }
        ]
    },
    execute: async (interaction) => {
        await interaction.deferReply({ ephemeral: true });

        if (!config.moderators.includes(interaction.user.id)) {
            return interaction.editReply({ content: 'You do not have moderator permissions.', ephemeral: true });
        }

        const type = interaction.options.getString('type');
        const id = interaction.options.getString('id');
        const price = interaction.options.getInteger('price');
        const time = interaction.options.getString('time');

        const canonicalTypes = {
            Skins: 'AthenaCharacter',
            AthenaCharacter: 'AthenaCharacter',
            Backblings: 'AthenaBackpack',
            AthenaBackPack: 'AthenaBackpack',
            AthenaBackpack: 'AthenaBackpack',
            Pickaxe: 'AthenaPickaxe',
            AthenaPickaxe: 'AthenaPickaxe',
            Gliders: 'AthenaGlider',
            AthenaGlider: 'AthenaGlider',
            Contrails: 'AthenaSkyDiveContrail',
            AthenaSkyDiveContrail: 'AthenaSkyDiveContrail',
            Emotes: 'AthenaDance',
            AthenaDance: 'AthenaDance',
            'Loading Screens': 'AthenaLoadingScreen',
            AthenaLoadingScreen: 'AthenaLoadingScreen',
            MusicPack: 'AthenaMusicPack',
            AthenaMusicPack: 'AthenaMusicPack'
        };

        const selectedType = canonicalTypes[type];
        if (!selectedType) {
            return interaction.editReply({ content: `Invalid type: ${type}`, ephemeral: true });
        }

        if (!id || typeof id !== 'string' || id.trim().length === 0) {
            return interaction.editReply({ content: 'Invalid ID value.', ephemeral: true });
        }

        if (typeof price !== 'number' || price < 0) {
            return interaction.editReply({ content: 'Price must be a valid non-negative number.', ephemeral: true });
        }

        const validTimes = ['いますぐ', 'いつもどうり'];
        if (!validTimes.includes(time)) {
            return interaction.editReply({ content: 'Time must be いますぐ or いつもどうり.', ephemeral: true });
        }

        let manualCatalog = {};
        if (fs.existsSync(manualCatalogPath)) {
            try {
                manualCatalog = JSON.parse(fs.readFileSync(manualCatalogPath, 'utf-8')) || {};
            } catch (err) {
                manualCatalog = {};
            }
        }

        const entryKey = `manual_${selectedType}_${id.replace(/[^A-Za-z0-9_]/g, '_')}_${Date.now()}`;
        manualCatalog[entryKey] = {
            itemGrants: [`${selectedType}:${id}`],
            price,
            time
        };

        fs.writeFileSync(manualCatalogPath, JSON.stringify(manualCatalog, null, 2), 'utf-8');

        return interaction.editReply({
            content: `Shop entry created: ${selectedType}:${id} for ${price} V-Bucks (${time}).`,
            ephemeral: true
        });
    }
};
