import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class University extends Model {
  public id!: string;
  public name!: string;
  public country!: string;
  public specializations!: any[];
  public studentProblems!: any[];
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

University.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    country: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    specializations: {
      type: DataTypes.JSONB,
      defaultValue: [],
    },
    studentProblems: {
      type: DataTypes.JSONB,
      defaultValue: [],
    },
  },
  {
    sequelize,
    tableName: 'universities',
    timestamps: true,
  }
);

export default University;
