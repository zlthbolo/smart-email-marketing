import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class Campaign extends Model {
  public id!: string;
  public userId!: string;
  public name!: string;
  public subject!: string;
  public body!: string;
  public htmlBody!: string;
  public campaignType!: 'email' | 'whatsapp';
  public status!: 'draft' | 'scheduled' | 'running' | 'completed' | 'paused';
  public selectedUniversities!: string[];
  public selectedSpecializations!: string[];
  public aiDialect!: 'formal' | 'qatari' | 'kuwaiti';
  public aiRewriteLevel!: number;
  public aiRewriteFrequency!: number;
  public useCommercialEmail!: boolean;
  public commercialName!: string;
  public totalRecipients!: number;
  public sentCount!: number;
  public openedCount!: number;
  public clickedCount!: number;
  public bouncedCount!: number;
  public scheduledFor!: Date;
  public startedAt!: Date;
  public completedAt!: Date;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Campaign.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    subject: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    body: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    htmlBody: {
      type: DataTypes.TEXT,
    },
    campaignType: {
      type: DataTypes.ENUM('email', 'whatsapp'),
      defaultValue: 'email',
    },
    status: {
      type: DataTypes.ENUM('draft', 'scheduled', 'running', 'completed', 'paused'),
      defaultValue: 'draft',
    },
    selectedUniversities: {
      type: DataTypes.JSONB,
      defaultValue: [],
    },
    selectedSpecializations: {
      type: DataTypes.JSONB,
      defaultValue: [],
    },
    aiDialect: {
      type: DataTypes.ENUM('formal', 'qatari', 'kuwaiti'),
      defaultValue: 'formal',
    },
    aiRewriteLevel: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      validate: { min: 0, max: 100 },
    },
    aiRewriteFrequency: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
    },
    useCommercialEmail: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    commercialName: {
      type: DataTypes.STRING,
    },
    totalRecipients: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    sentCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    openedCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    clickedCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    bouncedCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    scheduledFor: {
      type: DataTypes.DATE,
    },
    startedAt: {
      type: DataTypes.DATE,
    },
    completedAt: {
      type: DataTypes.DATE,
    },
  },
  {
    sequelize,
    tableName: 'campaigns',
    timestamps: true,
  }
);

export default Campaign;
