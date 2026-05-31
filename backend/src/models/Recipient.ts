import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class Recipient extends Model {
  public id!: string;
  public campaignId!: string;
  public email!: string;
  public firstName!: string;
  public lastName!: string;
  public university!: string;
  public specialization!: string;
  public status!: 'pending' | 'sent' | 'opened' | 'clicked' | 'bounced';
  public sentAt!: Date;
  public openedAt!: Date;
  public clickedAt!: Date;
  public bouncedAt!: Date;
  public trackingToken!: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Recipient.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    campaignId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    firstName: {
      type: DataTypes.STRING,
    },
    lastName: {
      type: DataTypes.STRING,
    },
    university: {
      type: DataTypes.STRING,
    },
    specialization: {
      type: DataTypes.STRING,
    },
    status: {
      type: DataTypes.ENUM('pending', 'sent', 'opened', 'clicked', 'bounced'),
      defaultValue: 'pending',
    },
    sentAt: {
      type: DataTypes.DATE,
    },
    openedAt: {
      type: DataTypes.DATE,
    },
    clickedAt: {
      type: DataTypes.DATE,
    },
    bouncedAt: {
      type: DataTypes.DATE,
    },
    trackingToken: {
      type: DataTypes.STRING,
      unique: true,
    },
  },
  {
    sequelize,
    tableName: 'recipients',
    timestamps: true,
  }
);

export default Recipient;
